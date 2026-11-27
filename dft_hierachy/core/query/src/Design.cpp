#include "hier/Design.h"

#include "ConnectionRefs.h"
#include "InstanceQueries.h"
#include "InstanceDescription.h"
#include "InstanceDescriptions.h"
#include "OffsetPage.h"
#include "Registers.h"
#include "Signals.h"
#include "Connectivity.h"
#include "QueryCancel.h"
#include "Lookup.h"
#include "Source.h"
#include "Step.h"
#include "Trace.h"
#include <algorithm>
#include <charconv>
#include <functional>
#include <set>

#include "hier/db/DesignDb.h"
#include "hier/model/Ids.h"
#include "hier/model/Schema.h"

namespace hier {

using namespace model;

BuildInfo buildInfo() {
    auto linked = frontend::linkedFrontend();
    return {kSchemaVersion, "slang", linked.version, linked.sourceId,
            frontend::sharingBlockedReason(linked, frontend::verifiedFrontend())};
}

namespace {

// A page of `all`, with a cursor bound to `binding` (the method and every argument that
// decides the order), so a cursor cannot be replayed against a different query
// (docs/DESIGN.md 5.2).
template <class T, class Make>
Result<Page<T>> paginate(size_t total, const PageRequest &page, const std::string &binding,
                         Make make, Cancel cancel = {}) {
    detail::checkpoint(cancel);
    auto window = detail::OffsetPage::read(page, binding);
    if (!window)
        return window.error();
    return window->materialize<T>(total, binding, std::move(make), cancel);
}

} // namespace

struct Design::Impl {
    db::DesignDb db;
    explicit Impl(std::unique_ptr<frontend::Frontend> fe, size_t cacheBytes)
        : db(std::move(fe), cacheBytes) {}

    Result<db::Located> locate(std::string_view ref, InstKey &key, Cancel cancel = {}) const {
        return detail::locateInstance(db, ref, key, cancel);
    }

    InstInfo describe(const InstKey &key, const db::Located &at, Cancel cancel = {}) const {
        return detail::describeInstance(db, key, at, cancel);
    }

};

Design::Design(std::unique_ptr<Impl> impl) : impl_(std::move(impl)) {}
Design::~Design() = default;

Result<model::QueryResult<model::TraceResult>>
Design::cone(const model::TracePoint &point, model::TraceDirection direction,
             model::TracePolicy policy, const model::Budget &budget, Cancel cancel) const {
    return detail::trace(impl_->db, {point.slice.ref, point.slice.bits, point.side, true}, {},
                         direction, policy, budget, cancel);
}
Result<model::QueryResult<model::TraceResult>>
Design::paths(const model::TracePoint &from, const model::TracePoint &to,
              const model::Budget &budget, Cancel cancel) const {
    return detail::trace(impl_->db, {from.slice.ref, from.slice.bits, from.side, true},
                         detail::TraceSelection{to.slice.ref, to.slice.bits, to.side, true},
                         model::TraceDirection::Forward, model::TracePolicy::Full, budget, cancel);
}
Result<model::QueryResult<model::TraceResult>>
Design::cone(std::string_view ref, model::TraceDirection direction, model::TracePolicy policy,
             const ConnectionRequest &request, const model::Budget &budget, Cancel cancel) const {
    return detail::trace(impl_->db, {std::string(ref), request.bits,
                         request.side.empty() ? std::nullopt : std::optional(request.side)}, {},
                         direction, policy, budget, cancel);
}
Result<model::QueryResult<model::TraceResult>>
Design::paths(std::string_view from, std::string_view to, const ConnectionRequest &fromRequest,
              const ConnectionRequest &toRequest, const model::Budget &budget, Cancel cancel) const {
    return detail::trace(impl_->db, {std::string(from), fromRequest.bits,
                         fromRequest.side.empty() ? std::nullopt : std::optional(fromRequest.side)},
                         detail::TraceSelection{std::string(to), toRequest.bits,
                         toRequest.side.empty() ? std::nullopt : std::optional(toRequest.side)},
                         model::TraceDirection::Forward, model::TracePolicy::Full, budget, cancel);
}

Result<model::QueryResult<model::StepResult>>
Design::step(std::string_view ref, bool upstream, const ConnectionRequest &request,
             const StepLimit &limit, Cancel cancel) const {
    return detail::step(impl_->db, ref, upstream, request, limit, cancel);
}

Result<model::QueryResult<Page<model::InstInfo>>>
Design::instancesOf(std::string_view def, const PageRequest &page, Cancel cancel) const {
    return detail::instancesOf(*this, impl_->db, def, page, cancel);
}
Result<model::QueryResult<Page<model::ObjectHit>>>
Design::search(const model::SearchQuery &query, const PageRequest &page, Cancel cancel) const {
    return detail::search(*this, impl_->db, query, page, cancel);
}
Result<model::QueryResult<std::vector<std::string>>>
Design::resolvePath(std::string_view text, Cancel cancel) const {
    return detail::resolvePath(impl_->db, text, cancel);
}

Result<std::unique_ptr<Design>> Design::open(const OpenOptions &options) {
    auto fe = frontend::openDesign(options);
    if (!fe)
        return fe.error();
    return std::unique_ptr<Design>(
        new Design(std::make_unique<Impl>(std::move(fe.value()), options.connectionCacheBytes)));
}

SnapshotInfo Design::snapshot() const { return snapshot({}).value(); }
Result<SnapshotInfo> Design::snapshot(Cancel cancel) const try {
    detail::checkpoint(cancel);
    auto &fe = impl_->db.frontend();
    SnapshotInfo s;
    s.schemaVersion = kSchemaVersion;
    s.frontend = fe.info();
    s.tops = detail::checked(roots(cancel));
    s.definitionCount = fe.definitions().size();
    s.bodyCount = fe.bodyCount();
    s.snapshotId = impl_->db.snapshotId();
    s.inputHash = impl_->db.inputHash();
    s.inputHashComplete = impl_->db.inputHashComplete();
    s.openedAt = impl_->db.openedAt();
    if (impl_->db.inferredTops())
        for (const auto &top : s.tops) {
            detail::checkpoint(cancel);
            s.topCandidates.push_back(top.ref);
        }
    return s;
} catch (const Error &error) {
    return error;
}

Diagnostics Design::diagnostics(size_t maxItems) const { return diagnostics(maxItems, {}).value(); }
Result<Diagnostics> Design::diagnostics(size_t maxItems, Cancel cancel) const try {
    detail::checkpoint(cancel);
    return impl_->db.frontend().diagnostics(maxItems, cancel);
} catch (const Error &error) {
    return error;
}

std::vector<InstInfo> Design::roots() const { return roots({}).value(); }
Result<std::vector<InstInfo>> Design::roots(Cancel cancel) const try {
    detail::checkpoint(cancel);
    std::vector<InstInfo> out;
    auto &tops = impl_->db.frontend().tops();
    for (uint32_t i = 0; i < tops.size(); i++) {
        detail::checkpoint(cancel);
        InstKey key{i};
        out.push_back(impl_->describe(key, detail::checked(impl_->db.locate(key, cancel)), cancel));
    }
    return out;
} catch (const Error &error) {
    return error;
}

Result<InstInfo> Design::instance(std::string_view ref) const { return instance(ref, {}); }
Result<InstInfo> Design::instance(std::string_view ref, Cancel cancel) const {
    return detail::instance(impl_->db, ref, cancel);
}

Result<Page<InstInfo>> Design::children(std::string_view ref, const PageRequest &page) const {
    return children(ref, page, {});
}
Result<Page<InstInfo>> Design::children(std::string_view ref, const PageRequest &page,
                                        Cancel cancel) const try {
    detail::checkpoint(cancel);
    InstKey key;
    auto at = impl_->locate(ref, key, cancel);
    if (!at)
        return at.error();
    size_t total = at->body == kNoBody
                       ? 0
                       : detail::checked(impl_->db.skeleton(at->body, cancel))->slots.size();
    detail::InstanceDescriptions descriptions(impl_->db);
    return paginate<InstInfo>(
        total, page, "children|" + std::string(ref),
        [&](size_t i) { return *detail::checked(descriptions.child(key, *at, uint32_t(i), cancel)); }, cancel);
} catch (const Error &error) {
    return error;
}

Result<std::vector<InstInfo>> Design::ancestors(std::string_view ref) const {
    return ancestors(ref, {});
}
Result<std::vector<InstInfo>> Design::ancestors(std::string_view ref, Cancel cancel) const try {
    detail::checkpoint(cancel);
    InstKey key;
    auto at = impl_->locate(ref, key, cancel);
    if (!at)
        return at.error();
    std::vector<InstInfo> out;
    detail::InstanceDescriptions descriptions(impl_->db);
    InstKey prefix;
    db::Located part;
    part.top = at->top;
    for (size_t depth = 1; depth < key.size(); depth++) {
        detail::checkpoint(cancel);
        prefix.push_back(key[depth - 1]);
        if (depth > 1)
            part.steps.push_back(at->steps[depth - 2]);
        part.body = at->steps[depth - 1].parentBody;
        out.push_back(*detail::checked(descriptions.located(prefix, part, cancel)));
    }
    return out;
} catch (const Error &error) {
    return error;
}

Result<Page<DefSummary>> Design::definitions(const PageRequest &page) const {
    return definitions(page, {});
}
Result<Page<DefSummary>> Design::definitions(const PageRequest &page, Cancel cancel) const try {
    detail::checkpoint(cancel);
    auto &defs = impl_->db.frontend().definitions();
    return paginate<DefSummary>(
        defs.size(), page, "definitions",
        [&](size_t i) {
            auto &d = defs[i];
            return DefSummary{defRef(uint32_t(i)), d.name, d.kind, d.file, d.line};
        },
        cancel);
} catch (const Error &error) {
    return error;
}

Result<std::vector<PortInfo>> Design::ports(std::string_view ref) const { return ports(ref, {}); }
Result<std::vector<PortInfo>> Design::ports(std::string_view ref, Cancel cancel) const {
    return detail::ports(impl_->db, ref, cancel);
}

Result<std::vector<ParamInfo>> Design::params(std::string_view ref) const {
    return params(ref, {});
}
Result<std::vector<ParamInfo>> Design::params(std::string_view ref, Cancel cancel) const {
    return detail::params(impl_->db, ref, cancel);
}

Result<Page<SignalInfo>> Design::signals(std::string_view ref, const PageRequest &page) const {
    return signals(ref, page, {}, {});
}
Result<Page<SignalInfo>> Design::signals(std::string_view ref, const PageRequest &page,
                                         std::string_view filterText, Cancel cancel) const {
    return detail::signals(impl_->db, ref, page, filterText, cancel);
}
Result<LocalNetlist> Design::bindings(std::string_view ref) const { return bindings(ref, {}); }
Result<LocalNetlist> Design::bindings(std::string_view ref, Cancel cancel) const try {
    detail::checkpoint(cancel);
    InstKey key;
    auto at = impl_->locate(ref, key, cancel);
    if (!at)
        return at.error();
    LocalNetlist out;
    out.inst = std::string(ref);
    if (at->body != kNoBody) {
        out.bindings = detail::checked(impl_->db.connections(at->body, cancel))->bindings;
        const detail::ReferenceScope scope(key);
        for (auto &b : out.bindings)
            scope.qualify(b, cancel);
    }
    return out;
} catch (const Error &error) {
    return error;
}
Result<Page<ProcessSummary>> Design::procs(std::string_view ref, const PageRequest &page) const {
    return procs(ref, page, {});
}
Result<Page<ProcessSummary>> Design::procs(std::string_view ref, const PageRequest &page,
                                           Cancel cancel) const try {
    detail::checkpoint(cancel);
    InstKey key;
    auto at = impl_->locate(ref, key, cancel);
    if (!at)
        return at.error();
    auto facts = at->body == kNoBody ? std::shared_ptr<const BodyConnections>{}
                                     : detail::checked(impl_->db.connections(at->body, cancel));
    const detail::ReferenceScope scope(key);
    return paginate<ProcessSummary>(
        facts ? facts->processes.size() : 0, page, "procs|" + std::string(ref),
        [&](size_t i) {
            auto &p = facts->processes[i].result;
            return ProcessSummary{scope.qualify(p.ref), p.kind};
        },
        cancel);
} catch (const Error &error) {
    return error;
}
Result<QueryResult<ProcessInfo>> Design::proc(std::string_view ref) const { return proc(ref, {}); }
Result<QueryResult<ProcessInfo>> Design::proc(std::string_view ref, Cancel cancel) const try {
    detail::checkpoint(cancel);
    auto key = detail::parseObject(ref);
    if (!key || key->kind != 'x')
        return Error{ErrorCode::BadRequest, "not a process reference"};
    auto at = impl_->db.locate(key->inst, cancel);
    if (!at)
        return at.error();
    if (at->body == kNoBody)
        return Error{ErrorCode::NotFound, "no such process"};
    auto facts = detail::checked(impl_->db.connections(at->body, cancel));
    if (key->index >= facts->processes.size())
        return Error{ErrorCode::NotFound, "no such process"};
    auto p = facts->processes[key->index];
    const detail::ReferenceScope scope(key->inst);
    scope.qualify(p.result, cancel);
    scope.qualify(p.completeness, cancel);
    return p;
} catch (const Error &error) {
    return error;
}
Result<ObjectInfo> Design::object(std::string_view ref) const { return object(ref, {}); }
Result<ObjectInfo> Design::object(std::string_view ref, Cancel cancel) const {
    return detail::object(impl_->db, ref, cancel);
}
Result<QueryResult<Page<RegisterInfo>>>
Design::registers(std::string_view ref, const PageRequest &page, bool recursive) const {
    return registers(ref, page, recursive, {});
}
Result<QueryResult<Page<RegisterInfo>>> Design::registers(std::string_view ref,
                                                          const PageRequest &page, bool recursive,
                                                          Cancel cancel) const try {
    return detail::registers(impl_->db, ref, page, recursive, cancel);
} catch (const Error &error) {
    return error;
}
FactCheck Design::verifyFacts() const {
    FactCheck result;
    auto diagnostics = impl_->db.frontend().diagnostics(0);
    if (diagnostics.errorCount || roots().empty()) {
        result.mismatched = 1;
        result.issues.push_back("invalid design or no elaborated top");
        return result;
    }
    for (BodyId i = 0; i < impl_->db.frontend().bodyCount(); ++i) {
        auto facts = impl_->db.connections(i);
        auto &c = facts->check;
        result.slangCompared += c.slangCompared;
        result.selfChecked += c.selfChecked;
        result.skippedExternal += c.skippedExternal;
        result.mismatched += c.mismatched;
        for (auto &issue : c.issues)
            result.issues.push_back("body " + std::to_string(i) + " " + issue);
    }
    if (!result.slangCompared && !result.selfChecked) {
        ++result.mismatched;
        result.issues.push_back("no applicable connection sources");
    }
    return result;
}

Result<Completeness> Design::connectionStatus(std::string_view ref) const {
    return connectionStatus(ref, {});
}
Result<Completeness> Design::connectionStatus(std::string_view ref, Cancel cancel) const try {
    detail::checkpoint(cancel);
    InstKey key;
    auto at = impl_->locate(ref, key, cancel);
    if (!at)
        return at.error();
    if (at->body == kNoBody)
        return Completeness{};
    auto status = detail::checked(impl_->db.connections(at->body, cancel))->completeness;
    detail::qualify(status, key, cancel);
    return status;
} catch (const Error &error) {
    return error;
}

Result<SourceSpan> Design::source(std::string_view ref, SourceKind kind) const {
    return source(ref, kind, {});
}
Result<SourceSpan> Design::source(std::string_view ref, SourceKind kind, Cancel cancel) const try {
    detail::checkpoint(cancel);
    return detail::source(impl_->db, ref, kind, cancel);
} catch (const Error &error) {
    return error;
}
Result<QueryResult<Page<SourceHit>>> Design::resolveSource(std::string_view file, size_t line,
    std::optional<size_t> column, const PageRequest &page, Cancel cancel) const {
    return detail::resolveSource(impl_->db, file, line, column, page, cancel);
}
Result<SourceRead> Design::readSource(std::string_view file, Cancel cancel) const {
    return detail::readSource(impl_->db, file, cancel);
}
Result<InputCheck> Design::checkInputs(Cancel cancel) const {
    return detail::checkInputs(impl_->db, cancel);
}
Result<model::QueryResult<std::vector<model::Endpoint>>>
Design::drivers(std::string_view ref, const ConnectionRequest &r) const {
    return drivers(ref, r, {});
}
Result<model::QueryResult<std::vector<model::Endpoint>>>
Design::loads(std::string_view ref, const ConnectionRequest &r) const {
    return loads(ref, r, {});
}
Result<model::QueryResult<std::vector<model::Endpoint>>>
Design::drivers(std::string_view ref, const ConnectionRequest &r, Cancel cancel) const try {
    return detail::connections(*this, impl_->db, ref, r, true, cancel);
} catch (const Error &error) {
    return error;
}
Result<model::QueryResult<std::vector<model::Endpoint>>>
Design::loads(std::string_view ref, const ConnectionRequest &r, Cancel cancel) const try {
    return detail::connections(*this, impl_->db, ref, r, false, cancel);
} catch (const Error &error) {
    return error;
}

} // namespace hier
