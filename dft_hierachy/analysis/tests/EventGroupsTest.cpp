#include "RegisterEventGroupsInternal.h"
#include "RegisterStatisticsInternal.h"
#include <algorithm>
#include <iostream>
#include <stdexcept>
namespace { void need(bool v, const char *m) { if (!v) throw std::runtime_error(m); } }
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions open; open.files = {DFT_EVENT_GROUP_FIXTURE}; open.tops = {"events_three"};
    auto design = hier::Design::open(open); need(bool(design), "open real RTL");
    StatisticsRequest request; request.scope = "events_three";
    auto input = registerStatistics(**design, request); need(bool(input) && input->complete && input->facts.size() == 3, "real original facts");
    design.value().reset();
    auto result = groupRegisterEvents(*input);
    need(bool(result) && result->complete && result->groups.size() == 3 && result->crossGroupBits == 4 &&
        result->overlapMembers == 3 && result->checkedSignals == 1, "three groups share four bits, not eight excess memberships");
    std::stop_source stop; stop.request_stop();
    auto cancelled = groupRegisterEvents(*input, {}, stop.get_token());
    need(!cancelled && cancelled.error().code == hier::ErrorCode::Cancelled, "pre-cancel Error only");
    auto expired = detail::eventGroupsWithDeadline(*input, {}, {}, {});
    need(bool(expired) && !expired->complete && expired->work == 0 && expired->groups.empty(), "deterministic expired deadline");
    EventGroupLimits limits; limits.maxMillis = 0;
    need(!groupRegisterEvents(*input, limits), "invalid limits");
    auto bad = *input; bad.facts[0].page = bad.pages.size();
    auto rejected = groupRegisterEvents(bad); need(!rejected && rejected.error().code == hier::ErrorCode::BadRequest, "bad page index");
    bad = *input; bad.signals[0].facts.push_back(bad.signals[0].facts[0]);
    need(!groupRegisterEvents(bad), "duplicate member reference");
    bad = *input;
    for (auto &page : bad.pages) for (auto &fact : page.response.result.items) fact.clock.signal.clear();
    auto unknown = groupRegisterEvents(bad);
    need(bool(unknown) && !unknown->complete && unknown->groups.size() == 3 && unknown->crossGroupBits == 0 &&
        std::none_of(unknown->groups.begin(), unknown->groups.end(), [](const auto &g) { return g.identityComplete; }),
        "absent identity cannot merge or prove cross-group attribution; shape validation is not authenticity");
    limits = {}; limits.maxOverlapMembers = 2;
    auto bounded = groupRegisterEvents(*input, limits);
    need(bool(bounded) && !bounded->complete && bounded->attributions.empty() && bounded->overlapMembers == 0,
        "atomic attribution under membership cap");
    auto again = groupRegisterEvents(*input); need(bool(again) && again->complete, "reuse after error/cancel/truncation");
    input = hier::Error{hier::ErrorCode::Internal, "discard original"};
    need(result->groups[0].clock.signal.size() && result->attributions[0].segments[0].groups.size() == 3 &&
        !result->signals[0].facts.empty(), "result owns events and index containers after input release");
    std::cout << "Register event groups identities, cross-group bits, bounds, cancellation and ownership passed\n";
    return 0;
} catch (const std::exception &e) { std::cerr << e.what() << '\n'; return 1; }
