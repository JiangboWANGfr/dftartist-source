#include "hier/db/DesignDb.h"
#include "Observe.h"
#include <atomic>
#include <random>

namespace hier::db {

DesignDb::DesignDb(std::unique_ptr<frontend::Frontend> frontend, size_t cacheBytes)
    : frontend_(std::move(frontend)), skeletons_(frontend_->bodyCount()), cacheBytes_(cacheBytes) {
    // A process nonce plus monotonic serial avoids pointer reuse and cross-process
    // CLI cursor collisions. The id is private, not an object identity or cache key.
    static const std::string nonce = [] {
        std::random_device random;
        std::string value;
        for (int i = 0; i < 4; ++i)
            value += std::to_string(random()) + "-";
        return value;
    }();
    static std::atomic<uint64_t> serial{0};
    snapshotId_ = nonce + std::to_string(++serial);
    captureMetadata();
}

std::shared_ptr<const model::BodyConnections> DesignDb::connections(model::BodyId body) const {
    return connections(body, {}).value();
}
Result<std::shared_ptr<const model::BodyConnections>>
DesignDb::connections(model::BodyId body, Cancel cancel) const {
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "connection extraction cancelled"};
    if (auto i = connections_.find(body); i != connections_.end()) {
        recent_.splice(recent_.begin(), recent_, i->second.position);
        return i->second.facts;
    }
    auto facts = std::make_shared<const model::BodyConnections>(frontend_->connections(body));
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "connection extraction cancelled"};
    auto published = cacheConnections(body, {facts, {}}, cancel);
    if (!published)
        return published.error();
    return facts;
}

Result<IndexedConnections> DesignDb::indexedConnections(model::BodyId body, Cancel cancel) const {
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "connection indexing cancelled"};
    if (auto it = connections_.find(body); it != connections_.end() && it->second.index) {
        recent_.splice(recent_.begin(), recent_, it->second.position);
        return IndexedConnections{it->second.facts, it->second.index};
    }
    auto facts = connections(body, cancel);
    if (!facts)
        return facts.error();
    auto sk = skeleton(body, cancel);
    if (!sk)
        return sk.error();
    auto index = indexConnections(**facts, **sk, cancel);
    if (!index)
        return index.error();
    IndexedConnections completed{*facts, *index};
    auto published = cacheConnections(body, completed, cancel);
    if (!published)
        return published.error();
    return completed;
}

Result<bool> DesignDb::cacheConnections(model::BodyId body, IndexedConnections data,
                                       Cancel cancel) const {
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "connection caching cancelled"};
    // Oversized entries remain owned by the current query, without displacing the
    // cache. shared_ptr also pins entries during recursive cross-boundary queries.
    const size_t indexBytes = data.index ? data.index->estimatedBytes : 0;
    if (data.facts->estimatedBytes > cacheBytes_ || indexBytes > cacheBytes_ - data.facts->estimatedBytes)
        return false;
    const size_t bytes = data.facts->estimatedBytes + indexBytes;
    if (auto old = connections_.find(body); old != connections_.end()) {
        usedBytes_ -= old->second.bytes;
        recent_.erase(old->second.position);
        connections_.erase(old);
    }
    while (!recent_.empty() && usedBytes_ > cacheBytes_ - bytes) {
        if (cancel.stop_requested())
            return Error{ErrorCode::Cancelled, "connection caching cancelled"};
        auto id = recent_.back();
        observation::emit({observation::Kind::CacheEvict, id, connections_.at(id).bytes});
        if (cancel.stop_requested())
            return Error{ErrorCode::Cancelled, "connection caching cancelled"};
        usedBytes_ -= connections_.at(id).bytes;
        connections_.erase(id);
        recent_.pop_back();
    }
    observation::emit({observation::Kind::CachePublish, body, bytes});
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "connection caching cancelled"};
    recent_.push_front(body);
    connections_.emplace(body, Cached{std::move(data.facts), std::move(data.index), bytes, recent_.begin()});
    usedBytes_ += bytes;
    return true;
}

const model::BodySkeleton &DesignDb::skeleton(model::BodyId body) const {
    return *skeleton(body, {}).value();
}
Result<const model::BodySkeleton *> DesignDb::skeleton(model::BodyId body, Cancel cancel) const {
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "skeleton extraction cancelled"};
    auto &cached = skeletons_.at(body);
    if (!cached) {
        auto completed = std::make_unique<model::BodySkeleton>(frontend_->skeleton(body));
        if (cancel.stop_requested())
            return Error{ErrorCode::Cancelled, "skeleton extraction cancelled"};
        cached = std::move(completed);
    }
    return cached.get();
}

Result<Located> DesignDb::locate(const model::InstKey &key, Cancel cancel) const {
    auto &tops = frontend_->tops();
    if (key.empty() || key[0] >= tops.size())
        return Error{ErrorCode::NotFound, "no such top: " + model::formatInstKey(key)};

    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "instance lookup cancelled"};
    Located out;
    out.top = key[0];
    out.body = tops[key[0]].body;
    for (size_t i = 1; i < key.size(); i++) {
        if (out.body == model::kNoBody)
            return Error{ErrorCode::NotFound,
                         "instance has no children: " + model::formatInstKey(key)};
        auto sk = skeleton(out.body, cancel);
        if (!sk)
            return sk.error();
        auto &slots = (*sk)->slots;
        if (key[i] >= slots.size())
            return Error{ErrorCode::NotFound, "no such instance: " + model::formatInstKey(key)};
        out.steps.push_back({out.body, &slots[key[i]]});
        out.body = slots[key[i]].body;
    }
    return out;
}

} // namespace hier::db
