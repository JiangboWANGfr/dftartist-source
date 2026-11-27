#include "InventoryInternal.h"
#include "SourceIdentity.h"
#include "ReportValidation.h"
#include <algorithm>
#include <map>
#include <set>

namespace dft::sequential {
namespace {
using namespace hier;
void checkpoint(Cancel cancel) {
    if (cancel.stop_requested()) throw Error{ErrorCode::Cancelled, "Source inventory cancelled"};
}
} // namespace

void detail::validateInventoryLimits(const InventoryLimits &r) {
    if (!r.maxGroups || r.maxGroups > 10000 || !r.maxMembers || r.maxMembers > 1000000 ||
        !r.maxWork || r.maxWork > 10000000 || !r.maxMillis || r.maxMillis > 60000)
        throw Error{ErrorCode::BadRequest, "Invalid source inventory budget"};
}
Result<SourceInventory> detail::inventoryWithDeadline(const Report &r, const InventoryLimits &limits,
    std::chrono::steady_clock::time_point deadline, Cancel cancel) try {
    validateInventoryLimits(limits); checkpoint(cancel); const auto events = validateReportReferences(r, cancel);
    SourceInventory result;
    result.inputChecks = r.checks.size(); result.inputFacts = r.registers.size(); result.inputEvents = events;
    result.snapshotId = r.snapshot.snapshotId; result.scope = r.scope; result.limits = limits;
    const auto partial = [&](const std::string &reason) {
        result.complete = false;
        if (std::find(result.reasons.begin(), result.reasons.end(), reason) == result.reasons.end())
            result.reasons.push_back(reason);
    };
    if (!r.complete) partial("analysis_incomplete");
    const auto time = [&] {
        checkpoint(cancel);
        if (std::chrono::steady_clock::now() < deadline) return true;
        partial("budget_time"); return false;
    };
    bool stopped = false;
    const auto spend = [&] {
        if (!time()) { stopped = true; return false; }
        if (result.work >= limits.maxWork) { partial("budget_work"); stopped = true; return false; }
        ++result.work; return true;
    };
    std::map<detail::SourceKey, size_t> groups;
    std::vector<std::optional<size_t>> groupForCheck(r.checks.size());
    for (size_t i = 0; i < r.checks.size(); ++i) {
        if (!spend()) break;
        auto source = detail::projectSource(r.checks[i], spend);
        if (stopped) break; // No completed classification for a partly scanned graph.
        ++result.processedChecks;
        if (!source) {
            result.unresolved.push_back({i, {"source_unresolved"}});
            partial("unresolved_source"); continue;
        }
        auto k = detail::sourceKey(*source);
        auto found = groups.find(k);
        size_t group = 0;
        if (found == groups.end()) {
            if (result.groups.size() >= limits.maxGroups) {
                result.unresolved.push_back({i, {"budget_groups"}}); partial("budget_groups"); continue;
            }
            group = result.groups.size(); groups.emplace(std::move(k), group);
            result.groups.push_back({std::move(*source), {}, {}});
        } else group = found->second;
        groupForCheck[i] = group; result.groups[group].checks.push_back(i);
    }
    uint64_t members = 0;
    const auto member = [&](size_t record, std::optional<size_t> check, std::optional<size_t> async) {
        if (!spend()) return false;
        ++result.visitedEvents;
        if (!check) { partial("missing_check"); return true; }
        if (!groupForCheck[*check]) return true; // Unresolved/omitted check remains in the original report.
        if (members >= limits.maxMembers) { partial("budget_members"); return false; }
        result.groups[*groupForCheck[*check]].members.push_back({record, *check, async}); ++members;
        return true;
    };
    bool more = !stopped;
    for (size_t i = 0; more && i < r.registers.size(); ++i) {
        const auto &record = r.registers[i];
        more = member(i, record.clockCheck, {});
        for (size_t j = 0; more && j < record.asyncChecks.size(); ++j) more = member(i, record.asyncChecks[j], j);
    }
    (void)time();
    return result;
} catch (const Error &error) { return error; }

Result<SourceInventory> inventorySources(const Report &r, const InventoryLimits &limits, Cancel cancel) {
    try { detail::validateInventoryLimits(limits); } catch (const Error &error) { return error; }
    return detail::inventoryWithDeadline(r, limits,
        std::chrono::steady_clock::now() + std::chrono::milliseconds(int64_t(limits.maxMillis)), cancel);
}
}
