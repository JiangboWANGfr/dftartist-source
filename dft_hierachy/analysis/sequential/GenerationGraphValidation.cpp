#include "GenerationGraphValidation.h"
#include "SourceIdentity.h"
#include <algorithm>
#include <set>
namespace dft::sequential::detail {
namespace {
using namespace hier;
using namespace hier::model;
using Key=SourcePointKey;
Key key(const TracePoint &p) {return {p.slice.ref,p.slice.bits.lsb,p.slice.bits.width,p.side};}
void checkpoint(Cancel c) {if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Generation comparison cancelled"};}
void require(bool b) {if(!b) throw Error{ErrorCode::BadRequest,"Generation comparison requires matching, valid scenario reports and graphs"};}
}
void validateGenerationGraphReferences(const ControlGeneration &g,size_t checkCount,
    const std::function<const Control &(size_t)> &check,hier::Cancel cancel) {
        require(g.nodes.size() <= 10000 && g.generators.size() <= 10000 && g.seeds.size() <= checkCount &&
            g.registerPages.size() <= 100000 && g.cycles.size() <= 1000);
        uint64_t facts = 0, events = 0;
        for (const auto &page : g.registerPages) {
            checkpoint(cancel); facts += page.response.result.items.size(); require(facts <= 100000);
        }
        std::set<Key> points;
        for (const auto &n : g.nodes) {
            checkpoint(cancel); require(points.insert(key(n.point)).second);
            if (n.originalCheck) {
                require(*n.originalCheck < checkCount && !n.control);
                require(key(n.point) == key(check(*n.originalCheck).point));
            } else require(n.control && key(n.point) == key(n.control->point));
            if (n.source) {
                const auto &s = *n.source;
                require(s.kind == "primary_input" || s.kind == "generated" || s.kind == "constant" || s.kind == "undriven");
                if (s.kind == "constant") require(s.value && s.value->size() == 1 && s.value->find_first_not_of("01xz") == std::string::npos);
                else require(s.point && s.point->slice.bits.width == 1);
                if (s.kind == "generated" || s.kind == "primary_input") require(s.sourceRef && !s.sourceRef->empty());
            }
            if (n.generator) require(*n.generator < g.generators.size() && n.source && n.source->kind == "generated" &&
                n.source->sourceRef == g.generators[*n.generator].fact.ref);
        }
        for (size_t j = 0; j < g.seeds.size(); ++j) {
            checkpoint(cancel); const auto &s = g.seeds[j];
            require(s.check == j && s.node < g.nodes.size() && g.nodes[s.node].originalCheck == j);
        }
        std::set<std::string> refs;
        for (const auto &v : g.generators) {
            checkpoint(cancel);
            require(refs.insert(v.fact.ref).second && v.page < g.registerPages.size());
            const auto &page = g.registerPages[v.page];
            require(v.item < page.response.result.items.size() && page.instance == v.fact.inst &&
                page.response.result.items[v.item].ref == v.fact.ref && v.asyncNodes.size() <= v.fact.async.size());
            require(v.fact.async.size() <= 1000000 && events <= 1000000 - v.fact.async.size());
            events += v.fact.async.size(); require(++events <= 1000000);
            const auto event = [&](std::optional<size_t> n, const EventInfo &e) {
                checkpoint(cancel);
                require(!n || (*n < g.nodes.size() && g.nodes[*n].point.slice.ref == e.signal &&
                    g.nodes[*n].point.slice.bits.lsb == e.bits.lsb && g.nodes[*n].point.slice.bits.width == e.bits.width));
            };
            event(v.clockNode, v.fact.clock);
            for (size_t j = 0; j < v.asyncNodes.size(); ++j) event(v.asyncNodes[j], v.fact.async[j]);
            if (v.expanded) require(v.clockNode && v.asyncNodes.size() == v.fact.async.size() &&
                std::all_of(v.asyncNodes.begin(), v.asyncNodes.end(), [](auto n) { return bool(n); }));
        }
}
}
