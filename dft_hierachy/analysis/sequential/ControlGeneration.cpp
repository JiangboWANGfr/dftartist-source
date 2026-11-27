#include "GenerationInternal.h"
#include "CheckInternal.h"
#include "ControlResolver.h"
#include "ReportValidation.h"
#include "SourceIdentity.h"
#include <algorithm>
#include <deque>
#include <map>
#include <set>

namespace dft::sequential {
namespace {
using namespace hier;
using namespace hier::model;
using PointKey = detail::SourcePointKey;
PointKey key(const TracePoint &p) { return {p.slice.ref, p.slice.bits.lsb, p.slice.bits.width, p.side}; }
template<class T> T take(Result<T> v) { if (!v) throw v.error(); return std::move(v.value()); }
class Walk {
    Design &design_;
    const detail::GenerationInput &input_;
    GenerationLimits limits_;
    std::chrono::steady_clock::time_point deadline_;
    Cancel cancel_;
    ControlGeneration out_;
    Request request_;
    std::set<std::string> tops_;
    bool stopped_ = false;
    std::map<PointKey, size_t> points_;
    std::map<std::string, size_t> generators_;
    std::deque<size_t> pending_;
    struct Location { size_t page, item; };
    struct Owner {
        InstInfo info;
        std::string cursor;
        bool done = false, partial = false;
        std::map<std::string, Location> facts;
    };
    std::map<std::string, Owner> owners_;
    void checkpoint() const {
        if (cancel_.stop_requested()) throw Error{ErrorCode::Cancelled, "Control generation cancelled"};
    }
    void partial(const std::string &r) {
        out_.complete = false;
        if (std::find(out_.reasons.begin(), out_.reasons.end(), r) == out_.reasons.end()) out_.reasons.push_back(r);
    }
    bool time() {
        checkpoint();
        if (std::chrono::steady_clock::now() < deadline_) return true;
        partial("budget_time"); stopped_ = true; return false;
    }
    bool spend() {
        if (!time()) return false;
        if (out_.work >= limits_.maxWork) { partial("budget_work"); stopped_ = true; return false; }
        ++out_.work; return true;
    }
    std::optional<size_t> add(const Control &control, uint64_t depth, std::optional<size_t> original) {
        const auto found = points_.find(key(control.point));
        if (found != points_.end()) return found->second;
        if (out_.nodes.size() >= limits_.maxControls) { partial("budget_controls"); return {}; }
        GenerationNode node;
        node.point = control.point; node.path = control.path; node.depth = depth; node.originalCheck = original;
        node.source = detail::projectSource(control, [&] { return spend(); });
        if (!node.source) { node.reasons.push_back("source_unresolved"); partial("control_unresolved"); }
        for (const auto &reason : control.reasons) if (reason.starts_with("budget_")) partial(reason);
        const auto id = out_.nodes.size();
        points_.emplace(key(node.point), id); out_.nodes.push_back(std::move(node)); pending_.push_back(id);
        return id;
    }
    std::optional<size_t> event(const EventInfo &event, uint64_t depth) {
        if (!spend()) return {};
        TracePoint point{{event.signal, event.bits}, {}};
        if (!event.signal.empty() && event.bits.width) {
            const auto object = take(design_.object(event.signal, cancel_));
            if (object.kind == "port") point.side = "inside";
        }
        const auto found = points_.find(key(point));
        if (found != points_.end()) return found->second;
        if (out_.nodes.size() >= limits_.maxControls) { partial("budget_controls"); return {}; }
        auto control = detail::resolveControl(event, {design_, request_, tops_, input_.clockRoots, input_.inputValues,
            out_.traceNodes, out_.traceEdges, out_.logicWork, deadline_, cancel_});
        const auto id = add(control, depth, {});
        if (id && !out_.nodes[*id].originalCheck && !out_.nodes[*id].control) out_.nodes[*id].control = std::move(control);
        return id;
    }
    std::optional<Location> lookup(const ControlSource &source) {
        if (!source.point || !source.sourceRef || !spend()) return {};
        const auto object = take(design_.object(source.point->slice.ref, cancel_));
        if (object.kind != "port" && object.kind != "signal")
            throw Error{ErrorCode::BadRequest, "Generated control origin is not a signal or port"};
        auto [it, inserted] = owners_.try_emplace(object.inst);
        auto &owner = it->second;
        if (inserted) {
            if (!spend()) return {};
            owner.info = take(design_.instance(object.inst, cancel_));
        }
        for (;;) {
            const auto found = owner.facts.find(*source.sourceRef);
            if (found != owner.facts.end()) return found->second;
            if (owner.done) {
                if (owner.partial) { partial("generator_lookup_incomplete"); return {}; }
                throw Error{ErrorCode::Internal, "Proven generating register is absent from complete instance facts"};
            }
            if (!spend()) return {};
            if (out_.registerFacts >= limits_.maxRegisterFacts) { partial("budget_register_facts"); return {}; }
            PageRequest page;
            page.cursor = owner.cursor; page.limit = int(std::min<uint64_t>(64, limits_.maxRegisterFacts - out_.registerFacts));
            auto response = take(design_.registers(object.inst, page, false, cancel_));
            if (response.result.items.size() > size_t(page.limit)) throw Error{ErrorCode::Internal, "Register page exceeds requested limit"};
            if (response.completeness.status != "complete") { owner.partial = true; partial("core_registers_partial"); }
            const auto next = response.result.next;
            if (!next.empty() && next == owner.cursor) throw Error{ErrorCode::Internal, "Register lookup cursor did not advance"};
            const auto p = out_.registerPages.size();
            out_.registerFacts += response.result.items.size();
            out_.registerPages.push_back({object.inst, page.cursor, std::move(response)});
            owner.cursor = next; owner.done = next.empty();
            const auto &facts = out_.registerPages[p].response.result.items;
            for (size_t j = 0; j < facts.size(); ++j) {
                if (!spend()) return {};
                if (facts[j].inst != object.inst) throw Error{ErrorCode::Internal, "Generating register occurrence differs from lookup instance"};
                if (!owner.facts.emplace(facts[j].ref, Location{p, j}).second)
                    throw Error{ErrorCode::Internal, "Register lookup repeated a fact"};
            }
        }
    }
    void expand(size_t id) {
        // Copy source/depth before adding nodes; the owned vectors may reallocate.
        const auto source = out_.nodes[id].source;
        const auto depth = out_.nodes[id].depth;
        if (!source || source->kind != "generated") return;
        const auto found = generators_.find(*source->sourceRef);
        if (found != generators_.end()) { out_.nodes[id].generator = found->second; return; }
        if (depth >= limits_.maxDepth) {
            out_.nodes[id].reasons.push_back("budget_generation_depth"); partial("budget_generation_depth"); return;
        }
        if (out_.generators.size() >= limits_.maxGenerators) {
            out_.nodes[id].reasons.push_back("budget_generators"); partial("budget_generators"); return;
        }
        const auto location = lookup(*source);
        if (!location || !spend()) { out_.nodes[id].reasons.push_back("generator_unexpanded"); return; }
        GeneratingRegister generator;
        generator.page = location->page; generator.item = location->item;
        generator.fact = out_.registerPages[location->page].response.result.items[location->item];
        generator.instancePath = owners_.at(generator.fact.inst).info.pathText;
        generator.signalPath = take(design_.object(generator.fact.signal, cancel_)).pathText;
        const auto g = out_.generators.size();
        generators_.emplace(generator.fact.ref, g); out_.generators.push_back(std::move(generator));
        out_.nodes[id].generator = g;
        const auto fact = out_.generators[g].fact;
        out_.generators[g].clockNode = event(fact.clock, depth + 1);
        for (const auto &async : fact.async) {
            if (stopped_) break;
            const auto n = event(async, depth + 1); out_.generators[g].asyncNodes.push_back(n);
        }
        const auto &value = out_.generators[g];
        out_.generators[g].expanded = value.clockNode && value.asyncNodes.size() == fact.async.size() &&
            std::all_of(value.asyncNodes.begin(), value.asyncNodes.end(), [](auto n) { return bool(n); });
    }
    void cycles() {
        struct Edge { size_t to, control; };
        std::vector<std::vector<Edge>> edges(out_.generators.size());
        for (size_t g = 0; g < out_.generators.size(); ++g) {
            const auto addEdge = [&](std::optional<size_t> n) {
                if (!n) return;
                const auto target = out_.nodes[*n].generator;
                if (target) edges[g].push_back({*target, *n});
            };
            if (!spend()) return;
            addEdge(out_.generators[g].clockNode);
            for (const auto n : out_.generators[g].asyncNodes) { if (!spend()) return; addEdge(n); }
        }
        std::vector<unsigned char> state(edges.size());
        struct Frame { size_t generator, next; std::optional<size_t> incoming; };
        std::vector<Frame> stack;
        for (size_t root = 0; root < edges.size(); ++root) {
            if (state[root]) continue;
            state[root] = 1; stack.push_back({root, 0, {}});
            while (!stack.empty()) {
                if (!spend()) return;
                auto &frame = stack.back();
                if (frame.next == edges[frame.generator].size()) { state[frame.generator] = 2; stack.pop_back(); continue; }
                const auto edge = edges[frame.generator][frame.next++];
                if (!state[edge.to]) { state[edge.to] = 1; stack.push_back({edge.to, 0, edge.control}); }
                else if (state[edge.to] == 1) {
                    if (out_.cycles.size() >= limits_.maxCycles) { partial("budget_cycles"); return; }
                    GenerationCycle cycle;
                    const auto start = std::find_if(stack.begin(), stack.end(), [&](const auto &f) { return f.generator == edge.to; });
                    for (auto f = start; f != stack.end(); ++f) {
                        if (!spend()) return;
                        cycle.generators.push_back(f->generator);
                        if (f != start) cycle.controls.push_back(*f->incoming);
                    }
                    cycle.generators.push_back(edge.to); cycle.controls.push_back(edge.control);
                    out_.cycles.push_back(std::move(cycle)); partial("generation_cycle");
                }
            }
        }
    }
  public:
    Walk(Design &d, const detail::GenerationInput &r, GenerationLimits limits, std::chrono::steady_clock::time_point deadline, Cancel cancel)
        : design_(d), input_(r), limits_(limits), deadline_(deadline), cancel_(cancel), request_(r.request) {
        out_.limits = limits; out_.snapshotId = r.snapshotId; out_.scope = r.scope; out_.inputChecks = r.checkCount;
        request_.maxTraceNodes = limits.maxTraceNodes; request_.maxTraceEdges = limits.maxTraceEdges;
        request_.maxLogicWork = limits.maxLogicWork;
    }
    ControlGeneration run() {
        checkpoint();
        if (!input_.complete) partial("analysis_incomplete");
        for (const auto &top : take(design_.roots(cancel_))) tops_.insert(top.ref);
        for (size_t i = 0; i < input_.checkCount; ++i) {
            if (!spend()) break;
            const auto n = add(input_.check(i), 0, i);
            if (!n) break;
            out_.seeds.push_back({i, *n});
        }
        while (!pending_.empty() && spend()) {
            const auto id = pending_.front(); pending_.pop_front(); expand(id);
        }
        if (!stopped_) cycles();
        (void)time(); return std::move(out_);
    }
};
}
Result<ControlGeneration> detail::generationFromInput(Design &design, const GenerationInput &input, const GenerationLimits &limits,
    std::chrono::steady_clock::time_point deadline, Cancel cancel) try {
    return Walk(design,input,limits,deadline,cancel).run();
} catch(const Error &e) {return e;}
void detail::validateGenerationLimits(const GenerationLimits &r) {
    if (!r.maxControls || r.maxControls > 10000 || !r.maxGenerators || r.maxGenerators > 10000 ||
        !r.maxRegisterFacts || r.maxRegisterFacts > 100000 || !r.maxWork || r.maxWork > 10000000 ||
        r.maxDepth > 1000 || !r.maxCycles || r.maxCycles > 1000 || !r.maxMillis || r.maxMillis > 60000 ||
        !r.maxTraceNodes || r.maxTraceNodes > 1000000 || r.maxTraceEdges > 4000000 || !r.maxLogicWork || r.maxLogicWork > 1000000)
        throw Error{ErrorCode::BadRequest, "Invalid control generation budget"};
}
Result<ControlGeneration> detail::generationWithDeadline(Design &design, const Report &r, const GenerationLimits &limits,
    std::chrono::steady_clock::time_point deadline, Cancel cancel) try {
    validateGenerationLimits(limits);
    if (cancel.stop_requested()) return Error{ErrorCode::Cancelled, "Control generation cancelled"};
    validateRequest(r.request);
    if (!r.request.resolveLogic) return Error{ErrorCode::BadRequest, "Control generation requires logic analysis"};
    (void)validateReportReferences(r, cancel, "Control generation");
    if (take(design.snapshot(cancel)).snapshotId != r.snapshot.snapshotId)
        return Error{ErrorCode::BadRequest, "Control generation requires the matching Design snapshot"};
    const GenerationInput input{r.request,r.snapshot.snapshotId,r.scope,r.complete,r.checks.size(),
        [&](size_t i)->const Control & {return r.checks[i];},r.clockRoots,r.inputValues};
    return generationFromInput(design, input, limits, deadline, cancel);
} catch (const Error &error) { return error; }
Result<ControlGeneration> controlGeneration(Design &design, const Report &r, const GenerationLimits &limits, Cancel cancel) {
    try { detail::validateGenerationLimits(limits); } catch (const Error &e) { return e; }
    return detail::generationWithDeadline(design, r, limits,
        std::chrono::steady_clock::now() + std::chrono::milliseconds(int64_t(limits.maxMillis)), cancel);
}
}
