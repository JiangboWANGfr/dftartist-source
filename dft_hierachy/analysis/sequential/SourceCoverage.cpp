#include "SourceCoverage.h"
#include "IntervalCoverage.h"
#include <algorithm>
namespace dft::sequential::detail {
bool canonicalSourceCoverage(const RegisterSourceGroup &group,CanonicalSourceCoverage &value,
    const std::function<bool()> &tick,const std::function<bool()> &admitInterval) {
    for(const auto &signal:group.signals) {
        if(!tick()) return false;
        auto &dest=value[signal.signal];
        for(const auto &segment:signal.coverage->segments) {
            if(!tick()) return false;
            const auto &b=segment.bits;
            if(!dest.empty()&&checkedCountAdd(dest.back().first,dest.back().second)==b.lsb)
                dest.back().second=checkedCountAdd(dest.back().second,b.width);
            else {
                if(!admitInterval()) return false;
                dest.emplace_back(b.lsb,b.width);
            }
        }
    }
    return true;
}

bool appendCanonicalRange(std::vector<hier::model::BitRange> &dest,const hier::model::BitRange &bits,const std::function<bool()> &admitRange) {
    if(!dest.empty()&&intervalEnd(dest.back())==bits.lsb) dest.back().width=checkedCountAdd(dest.back().width,bits.width);
    else {if(!admitRange()) return false;dest.push_back(bits);}
    return true;
}

std::optional<SourceIntervalPartition> partitionSourceIntervals(std::span<const CanonicalInterval> a,
    std::span<const CanonicalInterval> b,const std::function<bool()> &tick,const std::function<bool()> &admitRange) {
    SourceIntervalPartition out;size_t ai=0,bi=0;bool activeA=false,activeB=false;std::optional<uint64_t> previous;
    const auto next=[](std::span<const CanonicalInterval> list,size_t i,bool active)->std::optional<uint64_t> {
        if(i==list.size()) return {};const auto [lsb,width]=list[i];return active?checkedCountAdd(lsb,width):lsb;
    };
    for(;;) {
        const auto pa=next(a,ai,activeA),pb=next(b,bi,activeB);if(!pa&&!pb) break;
        if(!tick()) return {};
        const auto position=!pa?*pb:!pb?*pa:std::min(*pa,*pb);
        if(previous&&position>*previous&&(activeA||activeB)) {
            auto &dest=activeA?(activeB?out.retained:out.removed):out.added;
            const auto width=position-*previous;
            if(!appendCanonicalRange(dest,{*previous,width},admitRange)) return {};
        }
        if(pa&&*pa==position) {if(activeA) ++ai;activeA=!activeA;}
        if(pb&&*pb==position) {if(activeB) ++bi;activeB=!activeB;}
        previous=position;
    }
    return out;
}
}
