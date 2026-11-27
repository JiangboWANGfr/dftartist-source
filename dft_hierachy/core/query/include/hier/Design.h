#pragma once
#include <memory>
#include <string>
#include <string_view>
#include <vector>

#include "hier/model/Model.h"
#include "hier/model/Lookup.h"
#include "hier/model/Trace.h"
#include "hier/model/Result.h"

// L3: the kernel's real API (docs/DESIGN.md 5.1). The wire protocol and the CLI are
// translations of this class. Every query's result depends only on the opened design
// and its arguments, never on earlier queries.
namespace hier {

struct BuildInfo {
    int schemaVersion;
    std::string frontendName;
    std::string frontendVersion;
    std::string frontendSourceId;
    // Empty if this build may share bodies; otherwise why it may not (docs/DESIGN.md 4.1).
    std::string sharingBlockedReason;
};

BuildInfo buildInfo();

struct StepLimit {
    int maxHops = 1000;
    std::string cursor;
};

struct ConnectionRequest {
    std::optional<model::BitRange> bits;
    std::string reach = "local";
    std::string side;
};

class Design {
  public:
    static Result<std::unique_ptr<Design>> open(const model::OpenOptions &options);
    ~Design();

    model::SnapshotInfo snapshot() const;
    model::Diagnostics diagnostics(size_t maxItems = 200) const;

    // ---- navigation ----
    std::vector<model::InstInfo> roots() const;
    Result<model::InstInfo> instance(std::string_view instRef) const;
    // Children in child-slot order. The cursor is bound to this instance.
    Result<Page<model::InstInfo>> children(std::string_view instRef,
                                           const PageRequest &page = {}) const;
    // From the top down to the parent; empty for a top.
    Result<std::vector<model::InstInfo>> ancestors(std::string_view instRef) const;
    // In the definition table's fixed order: by name, then file, then line, all kinds
    // together.
    Result<Page<model::DefSummary>> definitions(const PageRequest &page = {}) const;
    Result<model::QueryResult<Page<model::InstInfo>>>
    instancesOf(std::string_view def, const PageRequest &page = {}, Cancel cancel = {}) const;
    Result<model::QueryResult<Page<model::ObjectHit>>>
    search(const model::SearchQuery &query, const PageRequest &page = {}, Cancel cancel = {}) const;
    Result<model::QueryResult<std::vector<std::string>>>
    resolvePath(std::string_view text, Cancel cancel = {}) const;

    Result<model::SourceSpan> source(std::string_view ref, model::SourceKind kind) const;
    Result<model::QueryResult<Page<model::SourceHit>>>
    resolveSource(std::string_view file, size_t line, std::optional<size_t> column = {},
                  const PageRequest &page = {}, Cancel cancel = {}) const;
    Result<model::SourceRead> readSource(std::string_view file, Cancel cancel = {}) const;
    Result<model::InputCheck> checkInputs(Cancel cancel = {}) const;

    // ---- detail ----
    Result<std::vector<model::PortInfo>> ports(std::string_view instRef) const;
    Result<std::vector<model::ParamInfo>> params(std::string_view instRef) const;
    Result<Page<model::SignalInfo>> signals(std::string_view instRef,
                                            const PageRequest &page = {}) const;
    Result<Page<model::SignalInfo>> signals(std::string_view instRef, const PageRequest &page,
                                            std::string_view filterText, Cancel cancel) const;
    Result<model::LocalNetlist> bindings(std::string_view instRef) const;
    Result<Page<model::ProcessSummary>> procs(std::string_view instRef,
                                              const PageRequest &page = {}) const;
    Result<model::QueryResult<model::ProcessInfo>> proc(std::string_view ref) const;
    Result<model::ObjectInfo> object(std::string_view ref) const;
    Result<model::QueryResult<Page<model::RegisterInfo>>>
    registers(std::string_view instRef, const PageRequest &page = {}, bool recursive = false) const;
    Result<model::QueryResult<std::vector<model::Endpoint>>>
    drivers(std::string_view ref, const ConnectionRequest &request = {}) const;
    Result<model::QueryResult<std::vector<model::Endpoint>>>
    loads(std::string_view ref, const ConnectionRequest &request = {}) const;
    Result<model::QueryResult<model::StepResult>> step(std::string_view ref, bool upstream,
                                                       const ConnectionRequest &request = {},
                                                       const StepLimit &limit = {},
                                                       Cancel cancel = {}) const;
    Result<model::QueryResult<model::TraceResult>>
    cone(const model::TracePoint &, model::TraceDirection, model::TracePolicy,
         const model::Budget &budget = {}, Cancel cancel = {}) const;
    Result<model::QueryResult<model::TraceResult>>
    paths(const model::TracePoint &from, const model::TracePoint &to,
          const model::Budget &budget = {}, Cancel cancel = {}) const;
    // Whole-object conveniences share the same validator / timed traversal. An
    // omitted request.bits selects the object's available bit space in the Core.
    Result<model::QueryResult<model::TraceResult>>
    cone(std::string_view ref, model::TraceDirection, model::TracePolicy,
         const ConnectionRequest &request = {}, const model::Budget &budget = {},
         Cancel cancel = {}) const;
    Result<model::QueryResult<model::TraceResult>>
    paths(std::string_view from, std::string_view to,
          const ConnectionRequest &fromRequest = {}, const ConnectionRequest &toRequest = {},
          const model::Budget &budget = {}, Cancel cancel = {}) const;
    Result<model::QueryResult<std::vector<model::Endpoint>>>
    drivers(std::string_view ref, const ConnectionRequest &request, Cancel cancel) const;
    Result<model::QueryResult<std::vector<model::Endpoint>>>
    loads(std::string_view ref, const ConnectionRequest &request, Cancel cancel) const;
    // Explicit cancellation overloads preserve the original entry points.
    Result<model::SnapshotInfo> snapshot(Cancel cancel) const;
    Result<model::Diagnostics> diagnostics(size_t maxItems, Cancel cancel) const;
    Result<std::vector<model::InstInfo>> roots(Cancel cancel) const;
    Result<model::InstInfo> instance(std::string_view ref, Cancel cancel) const;
    Result<Page<model::InstInfo>> children(std::string_view ref, const PageRequest &page,
                                           Cancel cancel) const;
    Result<std::vector<model::InstInfo>> ancestors(std::string_view ref, Cancel cancel) const;
    Result<Page<model::DefSummary>> definitions(const PageRequest &page, Cancel cancel) const;
    Result<std::vector<model::PortInfo>> ports(std::string_view ref, Cancel cancel) const;
    Result<std::vector<model::ParamInfo>> params(std::string_view ref, Cancel cancel) const;
    Result<model::LocalNetlist> bindings(std::string_view ref, Cancel cancel) const;
    Result<Page<model::ProcessSummary>> procs(std::string_view ref, const PageRequest &page,
                                              Cancel cancel) const;
    Result<model::QueryResult<model::ProcessInfo>> proc(std::string_view ref, Cancel cancel) const;
    Result<model::ObjectInfo> object(std::string_view ref, Cancel cancel) const;
    Result<model::QueryResult<Page<model::RegisterInfo>>>
    registers(std::string_view ref, const PageRequest &page, bool recursive, Cancel cancel) const;
    Result<model::SourceSpan> source(std::string_view ref, model::SourceKind kind,
                                     Cancel cancel) const;
    Result<model::Completeness> connectionStatus(std::string_view ref, Cancel cancel) const;
    model::FactCheck verifyFacts() const;
    Result<model::Completeness> connectionStatus(std::string_view instRef) const;

  private:
    struct Impl;
    explicit Design(std::unique_ptr<Impl> impl);
    std::unique_ptr<Impl> impl_;
};

} // namespace hier
