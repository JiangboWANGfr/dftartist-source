#include "ChangedRegisterCoverage.h"
#include "IntervalCoverage.h"
#include <algorithm>
#include <map>
namespace dft::sequential::detail {
namespace {
const hier::model::RegisterInfo &fact(const RegisterStatistics &s,size_t i) {
    const auto &f=s.facts[i];return s.pages[f.page].response.result.items[f.item];
}
}
void collectChangedFacts(ChangedRegisterCoverage &c,std::span<const size_t> groups) {
    std::map<size_t,size_t> signals;bool stopped=false;
    for (const auto gi:groups) {
        const auto &group=c.events.groups[gi];
        for (const auto si:group.signals) {
            if (!c.spend()) {stopped=true;break;}
            const auto &signal=c.events.signals[si];
            for (const auto f:signal.facts) {
                if (!c.spend()) {stopped=true;break;}
                if (c.memberFacts>=c.maxMembers) {c.partial("budget_members");stopped=true;break;}
                auto [it,fresh]=signals.try_emplace(signal.signal,c.signals.size());
                if (fresh) {c.signals.push_back({signal.signal,{}, {}});++c.totals.signals;}
                c.signals[it->second].facts.push_back(f);++c.totals.facts;++c.memberFacts;
                c.totals.factBits=checkedCountAdd(c.totals.factBits,fact(c.statistics,f).bits.width);
            }
            if (stopped) break;
        }
        if (stopped) break;
    }
    if (stopped) c.incomplete(c.membersReason);
}
void summarizeChangedFacts(ChangedRegisterCoverage &c) {
    for (auto &s:c.signals) {
        if (!c.spend()) break;
        std::vector<hier::model::BitRange> ranges;
        for (const auto f:s.facts) {if (!c.spend()) break;ranges.push_back(fact(c.statistics,f).bits);}
        if (ranges.size()!=s.facts.size()) break;
        bool interrupted=false;
        auto v=coverageForIntervals(ranges,c.maxSegments-c.segmentCount,[&] {
            if (c.spend()) return true;interrupted=true;return false;
        });
        if (!v) {if (!interrupted) c.partial("budget_segments");break;}
        ++c.totals.summarizedSignals;c.totals.summarizedFacts+=s.facts.size();
        c.totals.coveredBits=checkedCountAdd(c.totals.coveredBits,v->coveredBits);
        c.totals.overlapBits=checkedCountAdd(c.totals.overlapBits,v->overlapBits);
        c.totals.maxMultiplicity=std::max(c.totals.maxMultiplicity,v->maxMultiplicity);
        c.segmentCount+=v->segments.size();s.coverage=std::move(v);
    }
    if (std::any_of(c.signals.begin(),c.signals.end(),[](const auto &s) {return !s.coverage;}))
        c.incomplete(c.coverageReason);
}
}
