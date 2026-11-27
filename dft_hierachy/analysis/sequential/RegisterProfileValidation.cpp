#include "RegisterControlProfileInternal.h"
#include "RegisterStatisticsInternal.h"
#include "RegisterEventGroupsInternal.h"
#include "EventIdentity.h"
#include "SourceIdentity.h"
#include <algorithm>
#include <set>
namespace dft::sequential::detail {
namespace {
using namespace hier;
using namespace hier::model;
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Resolved register event grouping cancelled"};}
void require(bool b) {if(!b) throw Error{ErrorCode::BadRequest,"Resolved events require matching, unmodified statistics and profile"};}
const RegisterInfo &fact(const RegisterStatistics &s,size_t i) {const auto &f=s.facts[i];return s.pages[f.page].response.result.items[f.item];}
}
void validateRegisterProfileReferences(const RegisterStatistics &s, const RegisterControlProfile &p, Cancel c) {
    validateStatisticsReferences(s, c); validateRegisterControlOptions(p.options); validateEventGroupLimits(p.events.limits);
    const auto &e = p.events;
    require(p.snapshotId == s.snapshot.snapshotId && e.snapshotId == p.snapshotId && p.scope == s.scope && e.scope == p.scope);
    require(e.inputFacts == s.facts.size() && e.inputSignals == s.signals.size() && e.processedFacts <= s.facts.size() &&
        e.groups.size() <= 100000 && e.signals.size() <= s.facts.size() && p.checks.size() <= p.options.maxChecks &&
        p.groupControls.size() <= e.groups.size() && p.cohorts.size() <= 100000 && p.signals.size() <= 1000000);
    std::vector<unsigned char> seen(s.facts.size()), pairs(e.signals.size()); uint64_t members = 0, links = 0, events = 0;
    for (size_t gi = 0; gi < e.groups.size(); ++gi) {
        checkpoint(c); const auto &g = e.groups[gi];
        require(g.async.size() < 4000000 && events <= 4000000 - 1 - g.async.size()); events += 1 + g.async.size();
        bool known = !g.clock.signal.empty() && g.clock.bits.width;
        for (const auto &a : g.async) { checkpoint(c); known = known && !a.signal.empty() && a.bits.width; }
        require(known == g.identityComplete && g.clock.type.empty() && !g.signals.empty());
        std::set<size_t> signals;
        for (const auto si : g.signals) {
            checkpoint(c); require(++links <= e.signals.size() && si < e.signals.size() && !pairs[si]); pairs[si] = 1;
            const auto &v = e.signals[si]; require(v.group == gi && v.signal < s.signals.size() && signals.insert(v.signal).second && !v.facts.empty());
            for (const auto f : v.facts) {
                checkpoint(c); require(++members <= s.facts.size() && f < s.facts.size() && !seen[f] && s.facts[f].signal == v.signal); seen[f] = 1;
                auto clock = fact(s, f).clock; clock.type.clear();
                require(eventKey(clock) == eventKey(g.clock) && fact(s, f).async.size() == g.async.size());
                for (size_t i = 0; i < g.async.size(); ++i) { checkpoint(c); require(eventKey(fact(s, f).async[i]) == eventKey(g.async[i])); }
            }
        }
    }
    require(links == e.signals.size() && members == e.processedFacts);
    for (size_t i = 0; i < seen.size(); ++i) { checkpoint(c); require(bool(seen[i]) == (i < e.processedFacts)); }
    uint64_t nodes = 0, edges = 0; std::set<std::tuple<std::string,uint64_t,uint64_t>> points;
    for (const auto &v : p.checks) {
        checkpoint(c); const auto &point = v.control.point;
        require(points.emplace(point.slice.ref, point.slice.bits.lsb, point.slice.bits.width).second);
        if (v.control.trace) { nodes += v.control.trace->result.nodes.size(); edges += v.control.trace->result.edges.size(); }
        require(nodes <= p.options.maxTraceNodes && edges <= p.options.maxTraceEdges);
        if (v.source) {
            const auto projected = projectSource(v.control, [&] { checkpoint(c); return true; });
            require(projected && sameSource(*projected, *v.source));
        }
    }
    require(nodes == p.traceNodes && edges == p.traceEdges);
    uint64_t processed = 0, visited = 0;
    for (size_t i = 0; i < p.groupControls.size(); ++i) {
        checkpoint(c); const auto &row = p.groupControls[i]; const auto &g = e.groups[i];
        require(row.group == i && row.asyncChecks.size() == g.async.size());
        const auto check = [&](std::optional<size_t> ci, const EventInfo &event) {
            checkpoint(c); if (!ci) return;
            require(*ci < p.checks.size()); const auto &point = p.checks[*ci].control.point;
            require(point.slice.ref == event.signal && point.slice.bits.lsb == event.bits.lsb && point.slice.bits.width == event.bits.width); ++visited;
        };
        check(row.clockCheck, g.clock);
        for (size_t j = 0; j < row.asyncChecks.size(); ++j) check(row.asyncChecks[j], g.async[j]);
        const bool all = row.clockCheck && std::all_of(row.asyncChecks.begin(), row.asyncChecks.end(), [](auto ci) { return bool(ci); });
        require(row.eventsComplete == all && (!row.cohort || *row.cohort < p.cohorts.size())); processed += all;
    }
    require(processed == p.processedGroups && visited == p.visitedEvents);
}
}
