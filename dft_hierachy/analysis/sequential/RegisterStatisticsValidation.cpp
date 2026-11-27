#include "RegisterStatisticsInternal.h"
#include <set>
namespace dft::sequential::detail {
namespace {
using namespace hier;
using namespace hier::model;
void checkpoint(Cancel cancel) {
    if (cancel.stop_requested()) throw Error{ErrorCode::Cancelled, "Register event grouping cancelled"};
}
void require(bool valid) {
    if (!valid) throw Error{ErrorCode::BadRequest, "Register event grouping requires a valid, unmodified statistics report"};
}
const RegisterInfo &fact(const RegisterStatistics &r, size_t i) {
    const auto &f = r.facts[i]; return r.pages[f.page].response.result.items[f.item];
}
}
using namespace hier;
void validateStatisticsReferences(const RegisterStatistics &r, Cancel cancel) {
    detail::validateStatisticsRequest(r.request);
    require(r.facts.size() <= 1000000 && r.signals.size() <= 100000 && r.instances.size() <= 100000 &&
        r.definitions.size() <= 100000 && r.pages.size() <= 1100000 && r.totals.facts == r.facts.size() && r.totals.signals == r.signals.size());
    uint64_t returned = 0, events = 0, links = 0, factBits = 0;
    for (const auto &p : r.pages) {
        checkpoint(cancel); require(p.instance < r.instances.size());
        returned += p.response.result.items.size(); require(returned <= 1000000);
    }
    require(returned == r.returnedFacts && r.facts.size() <= returned);
    std::set<std::string> refs;
    for (size_t i = 0; i < r.facts.size(); ++i) {
        checkpoint(cancel); const auto &f = r.facts[i];
        require(f.page < r.pages.size() && f.item < r.pages[f.page].response.result.items.size() && f.signal < r.signals.size());
        const auto &v = fact(r, i); const auto &s = r.signals[f.signal];
        require(s.instance < r.instances.size() && r.pages[f.page].instance == s.instance &&
            v.signal == s.object.ref && v.inst == r.instances[s.instance].info.ref && s.object.inst == v.inst &&
            v.bits.width && refs.insert(v.ref).second);
        (void)intervalEnd(v.bits); factBits = checkedCountAdd(factBits, v.bits.width);
        require(v.async.size() < 4000000 && events <= 4000000 - 1 - v.async.size()); events += 1 + v.async.size();
    }
    std::vector<unsigned char> seen(r.facts.size());
    for (size_t i = 0; i < r.signals.size(); ++i) {
        checkpoint(cancel); const auto &s = r.signals[i]; require(s.instance < r.instances.size());
        for (const auto f : s.facts) {
            checkpoint(cancel); require(++links <= r.facts.size() && f < r.facts.size() && !seen[f] && r.facts[f].signal == i); seen[f] = 1;
        }
    }
    require(links == r.facts.size() && factBits == r.totals.factBits);
}
}
