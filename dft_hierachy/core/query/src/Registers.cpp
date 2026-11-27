#include "Registers.h"
#include "ConnectionRefs.h"
#include "OffsetPage.h"

namespace hier::detail {
Result<model::QueryResult<Page<model::RegisterInfo>>>
registers(const db::DesignDb &db, std::string_view ref, const PageRequest &page,
          bool recursive, Cancel cancel) try {
    checkpoint(cancel);
    auto key = model::parseInstRef(ref);
    if (!key)
        return Error{ErrorCode::BadRequest, "not an instance reference: " + std::string(ref)};
    auto located = db.locate(*key, cancel);
    if (!located)
        return located.error();
    const auto binding = "registers|" + std::string(ref) + (recursive ? "|recursive" : "");
    // Retain page errors until the original full traversal has finished: a later
    // extraction failure/cancellation still takes precedence over an invalid page.
    const auto window = OffsetPage::read(page, binding);
    size_t total = 0;
    std::vector<model::RegisterInfo> selected;
    model::Completeness completeness;
    auto project = [&](const model::InstKey &occurrence, const model::BodyConnections &facts) {
        // Off-page instances need no formatted key. A scope owns only this
        // occurrence prefix and is destroyed before entering the next body.
        std::optional<ReferenceScope> scope;
        auto references = [&]() -> const ReferenceScope & {
            if (!scope)
                scope.emplace(occurrence);
            return *scope;
        };
        for (const auto &source : facts.registers) {
            checkpoint(cancel);
            if (window && window->contains(total)) {
                auto reg = source;
                references().qualify(reg, cancel);
                selected.push_back(std::move(reg));
            }
            ++total;
        }
        if (facts.completeness.status != "complete") {
            completeness.status = "partial";
            for (auto reason : facts.completeness.reasons) {
                checkpoint(cancel);
                reason.at = references().qualify(std::move(reason.at));
                completeness.reasons.push_back(std::move(reason));
            }
        }
    };
    // Skeletons are immutable DB-owned data. Frames borrow only their slots,
    // never a connection lease or another frame's movable storage.
    struct Frame { const std::vector<model::ChildSlot> *slots; size_t next = 0; };
    std::vector<Frame> frames;
    auto occurrence = *key;
    auto enter = [&](model::BodyId body) {
        if (body == model::kNoBody)
            return false;
        {
            auto facts = checked(db.connections(body, cancel));
            project(occurrence, *facts);
        } // Release this query's facts before entering any child.
        if (!recursive)
            return false;
        frames.push_back({&checked(db.skeleton(body, cancel))->slots});
        return true;
    };
    enter(located->body);
    while (!frames.empty()) {
        checkpoint(cancel);
        auto &frame = frames.back();
        if (frame.next == frame.slots->size()) {
            frames.pop_back();
            if (!frames.empty())
                occurrence.pop_back();
            continue;
        }
        const auto child = frame.next++;
        const auto body = (*frame.slots)[child].body;
        occurrence.push_back(uint32_t(child));
        // enter() can grow the frame vector; do not retain its old element.
        if (!enter(body))
            occurrence.pop_back();
    }
    checkpoint(cancel);
    if (!window)
        return window.error();
    auto result = window->materialize<model::RegisterInfo>(total, binding,
        [&](size_t i) { return std::move(selected[i - window->offset]); }, cancel);
    if (!result)
        return result.error();
    return model::QueryResult<Page<model::RegisterInfo>>{std::move(*result),std::move(completeness)};
} catch (const Error &error) {
    return error;
}
} // namespace hier::detail
