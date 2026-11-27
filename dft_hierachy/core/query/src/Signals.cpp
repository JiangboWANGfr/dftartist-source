#include "Signals.h"
#include "ConnectionRefs.h"
#include "OffsetPage.h"

namespace hier::detail {
using namespace model;
Result<Page<SignalInfo>> signals(const db::DesignDb &db, std::string_view ref,
                                  const PageRequest &page, std::string_view filterText, Cancel cancel) try {
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "signals cancelled"};
    InstKey key;
    auto parsed = model::parseInstRef(ref);
    if (!parsed)
        return Error{ErrorCode::BadRequest, "not an instance reference: " + std::string(ref)};
    key = *parsed;
    auto at = db.locate(key, cancel);
    if (!at)
        return at.error();
    std::shared_ptr<const BodyConnections> facts;
    if (at->body != kNoBody) {
        auto loaded = db.connections(at->body, cancel);
        if (!loaded)
            return loaded.error();
        facts = *loaded;
    }
    std::string binding = "signals|" + std::string(ref);
    if (!filterText.empty())
        binding += "|filter:" + std::to_string(filterText.size()) + ":" + std::string(filterText);
    // Parse once, but defer page errors until the original complete filter scan.
    // Keep only the requested window's source indices, never all matching rows.
    const auto window = OffsetPage::read(page, binding);
    std::vector<size_t> selected;
    size_t total = facts && filterText.empty() ? facts->signals.size() : 0;
    if (facts && !filterText.empty())
        for (size_t i = 0; i < facts->signals.size(); ++i) {
            if (cancel.stop_requested())
                return Error{ErrorCode::Cancelled, "signals cancelled"};
            if (facts->signals[i].name.find(filterText) != std::string::npos) {
                if (window && window->contains(total))
                    selected.push_back(i);
                ++total;
            }
        }
    auto result = [&]() -> Result<Page<SignalInfo>> {
        checkpoint(cancel);
        if (!window)
            return window.error();
        const ReferenceScope scope(key);
        return window->materialize<SignalInfo>(total, binding, [&](size_t i) {
            auto s = facts->signals[filterText.empty() ? i : selected[i - window->offset]];
            s.ref = scope.qualify(std::move(s.ref));
            return s;
        }, cancel);
    }();
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "signals cancelled"};
    return result;
} catch (const Error &error) {
    return error;
}
} // namespace hier::detail
