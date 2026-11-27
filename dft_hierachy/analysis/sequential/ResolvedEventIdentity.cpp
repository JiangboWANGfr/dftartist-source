#include "ResolvedEventIdentity.h"
namespace dft::sequential::detail {
std::optional<ResolvedEventKey> resolvedEventKey(const ResolvedControlEvent &clock,std::span<const ResolvedControlEvent> events,
    const std::function<bool()> &tick) {
    std::vector<ResolvedAsyncKey> async;
    for (const auto &event:events) {
        if (!tick()) return {};
        async.emplace_back(sourceKey(event.source),event.edge,event.type);
    }
    return std::make_pair(ResolvedClockKey{sourceKey(clock.source),clock.edge},std::move(async));
}
}
