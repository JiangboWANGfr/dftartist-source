#include "GenerationComparisonInternal.h"
#include "ReportValidation.h"
#include "GenerationGraphValidation.h"
#include "SourceIdentity.h"
#include "EventIdentity.h"
#include <algorithm>
#include <map>
#include <set>

namespace dft::sequential {
namespace {
using namespace hier;
using namespace hier::model;
using Key = detail::SourcePointKey;
Key key(const TracePoint &p) { return {p.slice.ref, p.slice.bits.lsb, p.slice.bits.width, p.side}; }
using detail::eventKey;
void reason(std::vector<std::string> &v, const std::string &r) {
    if (std::find(v.begin(), v.end(), r) == v.end()) v.push_back(r);
}
void checkpoint(Cancel cancel) {
    if (cancel.stop_requested()) throw Error{ErrorCode::Cancelled, "Generation comparison cancelled"};
}
void require(bool valid) {
    if (!valid) throw Error{ErrorCode::BadRequest, "Generation comparison requires matching, valid scenario reports and graphs"};
}
void validate(const ScenarioReport &batch, std::span<const GenerationContext> contexts, Cancel cancel) {
    require(batch.scenarios.size() >= 2 && batch.scenarios.size() <= 8 && contexts.size() <= 8);
    size_t context = 0;
    for (size_t i = 0; i < batch.scenarios.size(); ++i) {
        checkpoint(cancel);
        if (!batch.scenarios[i].report) continue;
        require(context < contexts.size() && contexts[context].scenario == i);
        const auto &r = *batch.scenarios[i].report;
        const auto &g = contexts[context++].graph.get();
        require(r.request.resolveLogic && r.snapshot.snapshotId == batch.snapshot.snapshotId && r.scope == batch.scope &&
            g.snapshotId == batch.snapshot.snapshotId && g.scope == batch.scope && g.inputChecks == r.checks.size());
        (void)detail::validateReportReferences(r, cancel, "Generation comparison");
        detail::validateGenerationGraphReferences(g,r.checks.size(),[&](size_t j)->const Control & {return r.checks[j];},cancel);
    }
    require(context == contexts.size());
}
class Walk {
    const detail::GenerationComparisonInput &batch_;
    std::span<const GenerationContext> inputs_;
    GenerationComparisonReport out_;
    std::chrono::steady_clock::time_point deadline_;
    Cancel cancel_;
    bool stopped_ = false;
    void partial(const std::string &r) { out_.complete = false; reason(out_.reasons, r); }
    bool time() {
        checkpoint(cancel_);
        if (std::chrono::steady_clock::now() < deadline_) return true;
        partial("budget_time"); stopped_ = true; return false;
    }
    bool spend() {
        if (!time()) return false;
        if (out_.work >= out_.limits.maxWork) { partial("budget_work"); stopped_ = true; return false; }
        ++out_.work; return true;
    }
    GenerationCone cone(const ControlGeneration &g, size_t check) {
        GenerationCone out; out.check = check;
        const auto incomplete = [&](const std::string &r) { out.complete = false; reason(out.reasons, r); };
        if (check >= g.seeds.size()) { incomplete("seed_missing"); return out; }
        out.node = g.seeds[check].node;
        struct Frame { size_t node, edge = 0; bool entered = false; };
        std::vector<Frame> stack{{*out.node, 0, false}};
        std::map<size_t, unsigned char> state;
        while (!stack.empty()) {
            if (!spend()) { incomplete("traversal_truncated"); break; }
            auto &f = stack.back(); const auto &node = g.nodes[f.node];
            if (!f.entered) {
                if (out_.memberEntries >= out_.limits.maxMembers) {
                    partial("budget_members"); stopped_ = true; incomplete("budget_members"); break;
                }
                f.entered = true; state[f.node] = 1; out.nodes.push_back(f.node); ++out_.memberEntries;
                if (!node.source) incomplete("source_unresolved");
                if (!node.reasons.empty()) incomplete("node_incomplete");
                if (node.source && node.source->kind == "generated" && !node.generator) incomplete("generator_unexpanded");
                if (node.generator && !g.generators[*node.generator].expanded) incomplete("generator_unexpanded");
            }
            const auto *gen = node.generator ? &g.generators[*node.generator] : nullptr;
            if (!gen || f.edge > gen->asyncNodes.size()) { state[f.node] = 2; stack.pop_back(); continue; }
            const auto child = f.edge == 0 ? gen->clockNode : gen->asyncNodes[f.edge - 1]; ++f.edge;
            if (!child) { incomplete("event_missing"); continue; }
            const auto found = state.find(*child);
            if (found == state.end()) stack.push_back({*child, 0, false});
            else if (found->second == 1) incomplete("generation_cycle");
        }
        std::sort(out.nodes.begin(), out.nodes.end(), [&](size_t a, size_t b) { return key(g.nodes[a].point) < key(g.nodes[b].point); });
        return out;
    }
    bool sameNode(const ControlGeneration &a, size_t ai, const ControlGeneration &b, size_t bi) {
        const auto &x = a.nodes[ai]; const auto &y = b.nodes[bi];
        if (key(x.point) != key(y.point) || !detail::sameSource(*x.source, *y.source) || bool(x.generator) != bool(y.generator)) return false;
        if (!x.generator) return true;
        const auto &p = a.generators[*x.generator].fact; const auto &q = b.generators[*y.generator].fact;
        if (std::tie(p.ref, p.inst, p.signal, p.process, p.bits.lsb, p.bits.width) !=
            std::tie(q.ref, q.inst, q.signal, q.process, q.bits.lsb, q.bits.width) || eventKey(p.clock) != eventKey(q.clock) || p.async.size() != q.async.size()) return false;
        for (size_t i = 0; i < p.async.size(); ++i) {
            if (!spend()) return false;
            if (eventKey(p.async[i]) != eventKey(q.async[i])) return false;
        }
        return true;
    }
  public:
    Walk(const detail::GenerationComparisonInput &batch, std::span<const GenerationContext> inputs, GenerationComparisonLimits limits,
        std::chrono::steady_clock::time_point deadline, Cancel cancel)
        : batch_(batch), inputs_(inputs), deadline_(deadline), cancel_(cancel) {
        out_.snapshotId = batch.snapshotId; out_.scope = batch.scope; out_.limits = limits;
        for (const auto &c : inputs_) out_.inputCones += batch.checkCount(c.scenario);
    }
    GenerationComparisonReport run() {
        checkpoint(cancel_);
        if (!batch_.complete) partial("analysis_incomplete");
        std::vector<const ControlGeneration *> graphs(batch_.scenarios);
        std::vector<const GenerationCones *> cones(batch_.scenarios);
        out_.contexts.reserve(inputs_.size());
        for (const auto &input : inputs_) {
            const auto &graph = input.graph.get(); graphs[input.scenario] = &graph;
            if (!graph.complete) partial("generation_incomplete");
            GenerationCones context; context.scenario = input.scenario;
            const auto count = batch_.checkCount(input.scenario);
            for (size_t j = 0; j < count && !stopped_; ++j) {
                if (out_.processedCones >= out_.limits.maxCones) { partial("budget_cones"); stopped_ = true; break; }
                if (!spend()) break;
                auto value = cone(graph, j);
                if (!value.complete) partial("cone_incomplete");
                context.cones.push_back(std::move(value)); ++out_.processedCones;
            }
            out_.contexts.push_back(std::move(context)); cones[input.scenario] = &out_.contexts.back();
        }
        uint64_t rows = 0;
        for (size_t i = 1; i < batch_.scenarios; ++i) {
            GenerationChanges comparison; comparison.scenario = i;
            if (!batch_.present(0)) comparison.reasons.push_back("baseline_not_run");
            if (!batch_.present(i)) comparison.reasons.push_back("scenario_not_run");
            struct Pair { TracePoint point; std::optional<size_t> base, other; };
            std::map<Key, Pair> points;
            for (size_t s : {size_t{0}, i}) if (batch_.present(s) && !stopped_) {
                const auto count = batch_.checkCount(s);
                for (size_t j = 0; j < count; ++j) {
                    if (!spend()) break;
                    auto [it, inserted] = points.try_emplace(key(batch_.point(s,j)), Pair{batch_.point(s,j), {}, {}});
                    (void)inserted;
                    (s == 0 ? it->second.base : it->second.other) = j;
                }
            }
            for (const auto &[point, pair] : points) {
                (void)point;
                if (stopped_ || !spend()) break;
                if (rows >= out_.limits.maxRows) { partial("budget_rows"); stopped_ = true; break; }
                GenerationChange row; row.point = pair.point;
                const auto get = [&](size_t s, std::optional<size_t> index, std::optional<size_t> &dest) -> const GenerationCone * {
                    if (!index || !cones[s] || *index >= cones[s]->cones.size()) return nullptr;
                    dest = *index; return &cones[s]->cones[*index];
                };
                const auto *a = get(0, pair.base, row.baselineCone); const auto *b = get(i, pair.other, row.scenarioCone);
                if (!a) row.reasons.push_back("baseline_missing"); else if (!a->complete) row.reasons.push_back("baseline_unresolved");
                if (!b) row.reasons.push_back("scenario_missing"); else if (!b->complete) row.reasons.push_back("scenario_unresolved");
                row.status = "unresolved";
                if (row.reasons.empty()) {
                    bool equal = a->nodes.size() == b->nodes.size();
                    for (size_t n = 0; equal && n < a->nodes.size(); ++n) {
                        if (!spend()) break;
                        equal = sameNode(*graphs[0], a->nodes[n], *graphs[i], b->nodes[n]);
                    }
                    if (!stopped_) row.status = equal ? "unchanged" : "changed";
                    else row.reasons.push_back("comparison_truncated");
                }
                if (row.status == "unresolved") partial("comparison_unresolved");
                comparison.controls.push_back(std::move(row)); ++rows;
            }
            out_.comparisons.push_back(std::move(comparison));
        }
        (void)time(); return std::move(out_);
    }
};
}
Result<GenerationComparisonReport> detail::generationComparisonFromInput(const GenerationComparisonInput &input,
    std::span<const GenerationContext> contexts,const GenerationComparisonLimits &limits,
    std::chrono::steady_clock::time_point deadline,Cancel cancel) try {return Walk(input,contexts,limits,deadline,cancel).run();}
catch(const Error &e) {return e;}
void detail::validateGenerationComparisonLimits(const GenerationComparisonLimits &r) {
    if (!r.maxCones || r.maxCones > 80000 || !r.maxMembers || r.maxMembers > 1000000 ||
        !r.maxRows || r.maxRows > 100000 || !r.maxWork || r.maxWork > 10000000 || !r.maxMillis || r.maxMillis > 60000)
        throw Error{ErrorCode::BadRequest, "Invalid generation comparison budget"};
}
Result<GenerationComparisonReport> detail::compareGenerationWithDeadline(const ScenarioReport &batch,
    std::span<const GenerationContext> contexts, const GenerationComparisonLimits &limits,
    std::chrono::steady_clock::time_point deadline, Cancel cancel) try {
    validateGenerationComparisonLimits(limits); checkpoint(cancel); validate(batch, contexts, cancel);
    const GenerationComparisonInput input{batch.snapshot.snapshotId,batch.scope,batch.complete,batch.scenarios.size(),
        [&](size_t i) {return bool(batch.scenarios[i].report);},
        [&](size_t i) {return batch.scenarios[i].report->checks.size();},
        [&](size_t i,size_t j)->const TracePoint & {return batch.scenarios[i].report->checks[j].point;}};
    return generationComparisonFromInput(input,contexts,limits,deadline,cancel);
} catch (const Error &e) { return e; }
Result<GenerationComparisonReport> compareGenerationScenarios(const ScenarioReport &batch,
    std::span<const GenerationContext> contexts, const GenerationComparisonLimits &limits, Cancel cancel) {
    try { detail::validateGenerationComparisonLimits(limits); } catch (const Error &e) { return e; }
    return detail::compareGenerationWithDeadline(batch, contexts, limits,
        std::chrono::steady_clock::now() + std::chrono::milliseconds(int64_t(limits.maxMillis)), cancel);
}
}
