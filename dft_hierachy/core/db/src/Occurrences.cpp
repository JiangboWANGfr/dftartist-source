#include "hier/db/DesignDb.h"
#include "Observe.h"

namespace hier::db {

Result<std::shared_ptr<const Occurrences>> DesignDb::occurrences(Cancel cancel) const {
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "occurrence indexing cancelled"};
    if (occurrences_)
        return occurrences_;
    auto index = std::make_shared<Occurrences>();
    index->byDefinition.resize(frontend_->definitions().size());
    index->byBody.resize(frontend_->bodyCount());
    // An explicit DFS stack avoids recursion and holds only the active ancestry.
    struct Frame {
        size_t occurrence, nextChild = 0;
    };
    std::vector<Frame> stack;
    const auto &tops = frontend_->tops();
    for (size_t top = 0; top < tops.size(); ++top) {
        auto root = skeleton(tops[top].body, cancel);
        if (!root)
            return root.error();
        stack.push_back({index->items.size(), 0});
        index->items.push_back({{uint32_t(top)}, tops[top].body, (*root)->def, 0});
        while (!stack.empty()) {
            observation::emit({observation::Kind::OccurrenceVisit, stack.back().occurrence});
            if (cancel.stop_requested())
                return Error{ErrorCode::Cancelled, "occurrence indexing cancelled"};
            auto &frame = stack.back();
            const auto &occurrence = index->items[frame.occurrence];
            if (frame.nextChild == 0) {
                index->byDefinition[occurrence.definition].push_back(frame.occurrence);
                if (occurrence.body != model::kNoBody)
                    index->byBody[occurrence.body].push_back(frame.occurrence);
            }
            const model::BodySkeleton *body = nullptr;
            if (occurrence.body != model::kNoBody) {
                auto sk = skeleton(occurrence.body, cancel);
                if (!sk)
                    return sk.error();
                body = *sk;
            }
            if (!body || frame.nextChild == body->slots.size()) {
                index->items[frame.occurrence].end = index->items.size();
                stack.pop_back();
                continue;
            }
            auto child = frame.nextChild++;
            auto key = occurrence.key;
            key.push_back(uint32_t(child));
            const auto &slot = body->slots[child];
            stack.push_back({index->items.size(), 0});
            index->items.push_back({std::move(key), slot.body, slot.def, 0});
        }
    }
    observation::emit({observation::Kind::OccurrencePublish, 0, index->items.size()});
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "occurrence indexing cancelled"};
    occurrences_ = std::move(index);
    return occurrences_;
}

} // namespace hier::db
