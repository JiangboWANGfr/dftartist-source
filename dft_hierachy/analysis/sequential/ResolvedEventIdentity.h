#pragma once
#include "RegisterResolvedEvents.h"
#include "SourceIdentity.h"
#include <span>
namespace dft::sequential::detail {
using ResolvedClockKey = std::pair<SourceKey,std::string>;
using ResolvedAsyncKey = std::tuple<SourceKey,std::string,std::string>;
using ResolvedEventKey = std::pair<ResolvedClockKey,std::vector<ResolvedAsyncKey>>;
// Borrows values/callback only for this projection; nullopt means the caller's budget stopped it.
std::optional<ResolvedEventKey> resolvedEventKey(const ResolvedControlEvent &, std::span<const ResolvedControlEvent>,
    const std::function<bool()> &);
}
