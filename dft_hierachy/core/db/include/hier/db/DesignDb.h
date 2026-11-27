#pragma once
#include <list>
#include <memory>
#include <unordered_map>
#include <vector>

#include "hier/frontend/Frontend.h"
#include "hier/db/Occurrences.h"
#include "hier/db/SourceIndex.h"
#include "hier/db/ConnectionIndex.h"
#include "hier/model/Ids.h"
#include "hier/model/Model.h"
#include "hier/model/Result.h"

// L2: holds the opened design, caches the facts the frontend extracts, and resolves
// instance keys against them (docs/DESIGN.md 3.2). Knows nothing about the HDL library.
namespace hier::db {

// Where an instance key leads.
struct Located {
    uint32_t top = 0;
    // The child slot taken at each level below the top, with the body it was taken in.
    struct Step {
        model::BodyId parentBody;
        const model::ChildSlot *slot;
    };
    std::vector<Step> steps;
    model::BodyId body = model::kNoBody; // kNoBody when the instance is a blackbox or primitive
};

class DesignDb {
  public:
    explicit DesignDb(std::unique_ptr<frontend::Frontend> frontend,
                      size_t cacheBytes = 64 * 1024 * 1024);

    const frontend::Frontend &frontend() const { return *frontend_; }

    // Skeleton of a body. Extracted on first use; the cache is pure memoisation, so the
    // answer never depends on what was asked before.
    const model::BodySkeleton &skeleton(model::BodyId body) const;
    std::shared_ptr<const model::BodyConnections> connections(model::BodyId body) const;
    Result<const model::BodySkeleton *> skeleton(model::BodyId body, Cancel cancel) const;
    Result<std::shared_ptr<const model::BodyConnections>>
    connections(model::BodyId body, Cancel cancel) const;
    Result<IndexedConnections> indexedConnections(model::BodyId body, Cancel cancel = {}) const;
    Result<std::shared_ptr<const Occurrences>> occurrences(Cancel cancel) const;
    Result<std::shared_ptr<const SourceSnapshot>> sourceSnapshot(Cancel cancel = {}) const;
    Result<std::shared_ptr<const SourceIndex>> sourceIndex(Cancel cancel = {}) const;
    const std::string &snapshotId() const { return snapshotId_; }
    const std::string &inputHash() const { return inputHash_; }
    bool inputHashComplete() const { return inputHashComplete_; }
    const std::string &openedAt() const { return openedAt_; }
    bool inferredTops() const { return inferredTops_; }

    Result<Located> locate(const model::InstKey &key, Cancel cancel = {}) const;

  private:
    std::unique_ptr<frontend::Frontend> frontend_;
    mutable std::vector<std::unique_ptr<model::BodySkeleton>> skeletons_;
    size_t cacheBytes_;
    mutable size_t usedBytes_ = 0;
    mutable std::list<model::BodyId> recent_;
    struct Cached {
        std::shared_ptr<const model::BodyConnections> facts;
        std::shared_ptr<const ConnectionIndex> index;
        size_t bytes;
        std::list<model::BodyId>::iterator position;
    };
    Result<bool> cacheConnections(model::BodyId, IndexedConnections, Cancel) const;
    mutable std::unordered_map<model::BodyId, Cached> connections_;
    std::string snapshotId_;
    void captureMetadata();
    std::string inputHash_, openedAt_;
    bool inputHashComplete_ = false;
    bool inferredTops_ = false;
    mutable std::shared_ptr<const Occurrences> occurrences_;
    mutable std::shared_ptr<const SourceSnapshot> sourceSnapshot_;
    mutable std::shared_ptr<const SourceIndex> sourceIndex_;
};

} // namespace hier::db
