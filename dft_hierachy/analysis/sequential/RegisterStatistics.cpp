#include "RegisterStatisticsInternal.h"
#include "CheckInternal.h"
#include <algorithm>
#include <deque>
#include <map>
#include <set>

namespace dft::sequential {
namespace {
using namespace hier;
using namespace hier::model;
template<class T> T take(Result<T> value) { if (!value) throw value.error(); return std::move(*value); }
using detail::checkedCountAdd;
using detail::intervalEnd;
void checkpoint(Cancel cancel) {
    if (cancel.stop_requested()) throw Error{ErrorCode::Cancelled, "Register statistics cancelled"};
}
class Scan {
    Design &design_;
    RegisterStatistics out_;
    std::chrono::steady_clock::time_point deadline_;
    Cancel cancel_;
    bool stopEnumeration_ = false;
    std::map<std::string, size_t> definitions_, signals_;
    std::set<std::string> factRefs_, instanceRefs_;
    void partial(const std::string &why) {
        out_.complete = false;
        if (std::find(out_.reasons.begin(), out_.reasons.end(), why) == out_.reasons.end()) out_.reasons.push_back(why);
    }
    bool time() {
        checkpoint(cancel_);
        if (std::chrono::steady_clock::now() < deadline_) return true;
        partial("budget_time"); return false;
    }
    bool spend() {
        if (!time()) return false;
        if (out_.work >= out_.request.maxWork) { partial("budget_work"); return false; }
        ++out_.work; return true;
    }
    template<class F> void totals(size_t instance, F f) {
        f(out_.totals); f(out_.instances[instance].totals);
        f(out_.definitions[out_.instances[instance].definition].totals);
    }
    size_t instance(InstInfo info) {
        const auto [it, inserted] = definitions_.try_emplace(info.def, out_.definitions.size());
        if (inserted) out_.definitions.push_back({info.def, info.defName, {}, {}});
        const auto id = out_.instances.size();
        out_.instances.push_back({std::move(info), it->second, false, {}});
        out_.definitions[it->second].instances.push_back(id); return id;
    }
    bool fact(size_t page, size_t item) {
        if (!spend()) return false;
        const auto &raw = out_.pages[page].response.result.items[item];
        const auto inst = out_.pages[page].instance;
        if (raw.inst != out_.instances[inst].info.ref || !factRefs_.insert(raw.ref).second)
            throw Error{ErrorCode::Internal, "Register statistics page has an invalid or repeated occurrence"};
        (void)intervalEnd(raw.bits);
        auto found = signals_.find(raw.signal);
        size_t signal;
        if (found == signals_.end()) {
            if (out_.signals.size() >= out_.request.maxSignals) { partial("budget_signals"); return false; }
            if (!spend()) return false;
            auto object = take(design_.object(raw.signal, cancel_));
            if (object.inst != raw.inst || (object.kind != "signal" && object.kind != "port"))
                throw Error{ErrorCode::Internal, "Register signal metadata does not match its occurrence"};
            signal = out_.signals.size(); signals_.emplace(raw.signal, signal);
            out_.signals.push_back({std::move(object), inst, {}, {}});
            totals(inst, [](auto &t) { ++t.signals; });
        } else {
            signal = found->second;
            if (out_.signals[signal].instance != inst) throw Error{ErrorCode::Internal, "Register signal belongs to different instances"};
        }
        const auto id = out_.facts.size(); out_.facts.push_back({page, item, signal});
        out_.signals[signal].facts.push_back(id);
        totals(inst, [&](auto &t) { ++t.facts; t.factBits = checkedCountAdd(t.factBits, raw.bits.width); });
        return true;
    }
    void registers(size_t inst) {
        const auto &info = out_.instances[inst].info;
        if (info.kind == InstKind::Blackbox || info.kind == InstKind::Primitive || info.kind == InstKind::Interface) {
            partial("unmodeled_instance"); return;
        }
        PageRequest page; std::set<std::string> cursors;
        do {
            if (!spend()) { stopEnumeration_ = true; return; }
            if (out_.returnedFacts >= out_.request.maxFacts) { partial("budget_facts"); stopEnumeration_ = true; return; }
            page.limit = int(std::min<uint64_t>(200, out_.request.maxFacts - out_.returnedFacts));
            auto response = take(design_.registers(info.ref, page, false, cancel_));
            if (response.result.items.size() > size_t(page.limit)) throw Error{ErrorCode::Internal, "Register page exceeds requested capacity"};
            if (response.completeness.status != "complete") partial("core_registers_partial");
            for (const auto &r : response.completeness.reasons) partial(r.code + ": " + r.at + ": " + r.detail);
            const auto next = response.result.next;
            if (!next.empty() && !cursors.insert(next).second) throw Error{ErrorCode::Internal, "Register cursor repeated"};
            out_.returnedFacts += response.result.items.size();
            const auto p = out_.pages.size(); out_.pages.push_back({inst, page.cursor, std::move(response)});
            for (size_t i = 0; i < out_.pages[p].response.result.items.size(); ++i)
                if (!fact(p, i)) { stopEnumeration_ = true; return; }
            page.cursor = next;
        } while (!page.cursor.empty());
        out_.instances[inst].enumerated = true;
    }
    void summarize() {
        for (auto &signal : out_.signals) {
            if (!spend()) break;
            std::vector<BitRange> ranges;
            for (const auto index : signal.facts) {
                if (!spend()) break;
                const auto &f = out_.facts[index]; ranges.push_back(out_.pages[f.page].response.result.items[f.item].bits);
            }
            if (ranges.size() != signal.facts.size()) break;
            bool interrupted = false;
            auto value = detail::coverageForIntervals(ranges, out_.request.maxSegments - out_.segmentCount, [&] {
                if (spend()) return true;
                interrupted = true; return false;
            });
            if (!value) {
                if (!interrupted) partial("budget_segments");
                break;
            }
            out_.segmentCount += value->segments.size();
            totals(signal.instance, [&](auto &t) {
                ++t.summarizedSignals; t.summarizedFacts += signal.facts.size();
                t.coveredBits = checkedCountAdd(t.coveredBits, value->coveredBits); t.overlapBits = checkedCountAdd(t.overlapBits, value->overlapBits);
                t.maxMultiplicity = std::max(t.maxMultiplicity, value->maxMultiplicity);
            });
            signal.coverage = std::move(value);
        }
        if (out_.totals.summarizedSignals != out_.totals.signals) partial("statistics_unfinished");
    }
  public:
    Scan(Design &design, const StatisticsRequest &request, std::chrono::steady_clock::time_point deadline, Cancel cancel)
        : design_(design), deadline_(deadline), cancel_(cancel) { out_.request = request; }
    RegisterStatistics run() {
        checkpoint(cancel_); out_.snapshot = take(design_.snapshot(cancel_));
        auto root = detail::resolveScope(design_, out_.request.scope, cancel_); out_.scope = root.pathText;
        instanceRefs_.insert(root.ref); std::deque<InstInfo> pending; pending.push_back(std::move(root));
        while (!pending.empty() && !stopEnumeration_) {
            if (!spend()) break;
            const auto inst = instance(std::move(pending.front())); pending.pop_front(); registers(inst);
            if (!out_.request.recursive || stopEnumeration_) continue;
            PageRequest page; std::set<std::string> cursors;
            do {
                if (!spend()) { stopEnumeration_ = true; break; }
                const auto capacity = out_.request.maxInstances - out_.instances.size() - pending.size();
                page.limit = int(std::min<uint64_t>(200, capacity + 1));
                auto children = take(design_.children(out_.instances[inst].info.ref, page, cancel_));
                for (auto &child : children.items) {
                    if (!spend()) { stopEnumeration_ = true; break; }
                    if (!capacity || out_.instances.size() + pending.size() >= out_.request.maxInstances) { partial("budget_instances"); break; }
                    if (!instanceRefs_.insert(child.ref).second) throw Error{ErrorCode::Internal, "Hierarchy traversal repeated an instance"};
                    pending.push_back(std::move(child));
                }
                page.cursor = children.next;
                if (!page.cursor.empty() && !cursors.insert(page.cursor).second) throw Error{ErrorCode::Internal, "Children cursor repeated"};
                if (out_.instances.size() + pending.size() >= out_.request.maxInstances) {
                    if (!page.cursor.empty()) partial("budget_instances"); break;
                }
            } while (!page.cursor.empty() && !stopEnumeration_);
        }
        if (!pending.empty()) partial("unvisited_instances");
        summarize(); (void)time(); return std::move(out_);
    }
};
}
void detail::validateStatisticsRequest(const StatisticsRequest &r) {
    if (r.scope.empty() || !r.maxFacts || r.maxFacts > 1000000 || !r.maxInstances || r.maxInstances > 100000 ||
        !r.maxSignals || r.maxSignals > 100000 || !r.maxSegments || r.maxSegments > 2000000 ||
        !r.maxWork || r.maxWork > 10000000 || !r.maxMillis || r.maxMillis > 60000)
        throw Error{ErrorCode::BadRequest, "Invalid register statistics scope or budget"};
}
Result<RegisterStatistics> detail::statisticsWithDeadline(Design &design, const StatisticsRequest &request,
    std::chrono::steady_clock::time_point deadline, Cancel cancel) try {
    validateStatisticsRequest(request); return Scan(design, request, deadline, cancel).run();
} catch (const Error &error) { return error; }
Result<RegisterStatistics> registerStatistics(Design &design, const StatisticsRequest &request, Cancel cancel) {
    try { detail::validateStatisticsRequest(request); } catch (const Error &error) { return error; }
    return detail::statisticsWithDeadline(design, request,
        std::chrono::steady_clock::now() + std::chrono::milliseconds(int64_t(request.maxMillis)), cancel);
}
}
