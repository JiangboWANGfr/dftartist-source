#pragma once
#include "OccurrencePorts.h"
#include "ConnectionReferenceIndex.h"
#include "InstanceDescription.h"
#include "hier/db/DesignDb.h"
#include <map>
#include <unordered_map>

namespace hier::detail {
// Query-local immutable leases, independent of the L2 retention budget. Public
// entry validation is unchanged and can precede this snapshot's first lookup.
class ConnectionSnapshot {
  public:
    struct Occurrence {
        const model::InstKey key;
        std::shared_ptr<const model::BodyConnections> facts;
        // DB-owned skeletons outlive this query and are never evicted. Only
        // body-less instances own a synthesized occurrence port description.
        const std::vector<model::PortInfo> *bodyPorts = nullptr;
        std::vector<model::PortInfo> synthesizedPorts;
        Occurrence(model::InstKey instance, std::shared_ptr<const model::BodyConnections> bodyFacts,
                   const std::vector<model::PortInfo> *declarations,
                   std::vector<model::PortInfo> materialized)
            : key(std::move(instance)), facts(std::move(bodyFacts)), bodyPorts(declarations),
              synthesizedPorts(std::move(materialized)), scope_(key) {}
        const std::vector<model::PortInfo> &ports() const {
            return bodyPorts ? *bodyPorts : synthesizedPorts;
        }
        const ReferenceScope &scope() const { return scope_; }
        std::string ref(const std::string &local) const { return scope_.qualify(local); }
        std::string portRef(size_t index) const { return ref("p::" + std::to_string(index)); }

      private:
        // The key is fixed at admission; map nodes and this owning scope stay
        // stationary through recursive lookups and L2 cache eviction.
        const ReferenceScope scope_;
    };
    struct Lookup {
        const Occurrence &occurrence; // Borrowed until this snapshot is destroyed.
        bool inserted;
    };
    ConnectionSnapshot(const db::DesignDb &database, Cancel cancel)
        : db_(database), cancel_(cancel) {}
    ConnectionSnapshot(const ConnectionSnapshot &) = delete;
    ConnectionSnapshot &operator=(const ConnectionSnapshot &) = delete;
    ConnectionSnapshot(ConnectionSnapshot &&) = delete;
    ConnectionSnapshot &operator=(ConnectionSnapshot &&) = delete;

    Result<model::InstKind> instanceKind(std::string_view instance) try {
        checkpoint(cancel_);
        auto key = model::parseInstRef(instance);
        if (!key)
            return Error{ErrorCode::BadRequest, "not an instance reference: " + std::string(instance)};
        const auto ref = model::instRef(*key);
        if (auto found = instanceKinds_.find(ref); found != instanceKinds_.end())
            return found->second;
        const auto located = checked(db_.locate(*key, cancel_));
        const auto summary = instanceSummary(db_, located, cancel_);
        checkpoint(cancel_);
        // Cache only successful classification. No paths, name views, connection
        // facts, or failed/cancelled lookups become query state here.
        return instanceKinds_.emplace(ref, summary.kind).first->second;
    } catch (const Error &error) {
        return error;
    }

    Lookup load(std::string_view instance) {
        checkpoint(cancel_);
        auto key = model::parseInstRef(instance);
        if (!key)
            throw Error{ErrorCode::BadRequest, "not an instance reference: " + std::string(instance)};
        const auto ref = model::instRef(*key);
        if (auto found = occurrences_.find(ref); found != occurrences_.end())
            return {found->second, false};
        auto located = db_.locate(*key, cancel_);
        checkpoint(cancel_);
        if (!located)
            throw located.error();
        auto facts = body(located->body);
        const std::vector<model::PortInfo> *ports = nullptr;
        std::vector<model::PortInfo> synthesized;
        if (located->body != model::kNoBody) {
            auto skeleton = db_.skeleton(located->body, cancel_);
            checkpoint(cancel_);
            if (!skeleton)
                throw skeleton.error();
            ports = &(*skeleton)->ports;
        } else {
            auto parent = body(located->steps.back().parentBody);
            synthesized = occurrencePorts(*located->steps.back().slot, *key, parent->bindings, cancel_);
        }
        checkpoint(cancel_);
        auto [at, inserted] = occurrences_.try_emplace(
            ref, std::move(*key), std::move(facts), ports, std::move(synthesized));
        return {at->second, inserted};
    }
    FactReferenceIndex &references(const Occurrence &occurrence) {
        checkpoint(cancel_);
        auto &index = references_[occurrence.facts.get()];
        if (!index)
            index = std::make_unique<FactReferenceIndex>(*occurrence.facts);
        return *index;
    }
    PortReferenceIndex &portReferences(const Occurrence &occurrence) {
        checkpoint(cancel_);
        auto &index = portReferences_[&occurrence.ports()];
        if (!index)
            index = std::make_unique<PortReferenceIndex>(occurrence.ports());
        return *index;
    }

  private:
    const db::DesignDb &db_;
    Cancel cancel_;
    std::unordered_map<model::BodyId, std::shared_ptr<const model::BodyConnections>> bodies_;
    std::unordered_map<std::string, model::InstKind> instanceKinds_;
    std::map<std::string, Occurrence> occurrences_;
    std::shared_ptr<const model::BodyConnections> empty_;
    // Keys borrow leased facts, DB skeleton ports, or synthesized ports.
    // Indexes die before occurrences/body leases; the DB outlives the query,
    // and map growth cannot move an active index or its source port vector.
    std::unordered_map<const model::BodyConnections *, std::unique_ptr<FactReferenceIndex>> references_;
    std::unordered_map<const std::vector<model::PortInfo> *, std::unique_ptr<PortReferenceIndex>>
        portReferences_;
    std::shared_ptr<const model::BodyConnections> body(model::BodyId id) {
        checkpoint(cancel_);
        if (id == model::kNoBody) {
            if (!empty_)
                empty_ = std::make_shared<const model::BodyConnections>();
            return empty_;
        }
        if (auto found = bodies_.find(id); found != bodies_.end())
            return found->second;
        auto loaded = db_.connections(id, cancel_);
        checkpoint(cancel_);
        if (!loaded)
            throw loaded.error();
        // Publish only a complete immutable lease; L2 eviction cannot revoke it.
        return bodies_.emplace(id, std::move(*loaded)).first->second;
    }
};
} // namespace hier::detail
