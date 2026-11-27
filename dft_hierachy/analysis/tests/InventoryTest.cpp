#include "InventoryInternal.h"
#include "Scenarios.h"
#include <iostream>
#include <stdexcept>

namespace { void need(bool v, const char *message) { if (!v) throw std::runtime_error(message); } }
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions o; o.files = {DFT_FIXTURE, DFT_INVENTORY_FIXTURE}; o.tops = {"inventory_shared"};
    auto d = hier::Design::open(o); need(bool(d), "open");
    Request request; request.scope = "inventory_shared"; request.recursive = true; request.resolveLogic = true;
    auto r = analyze(**d, request); need(bool(r) && r->complete, "complete original");
    d.value().reset(); // Projection uses only the owned original report, never Design.
    auto inventory = inventorySources(*r);
    need(bool(inventory) && inventory->complete && inventory->groups.size() == 3 && inventory->visitedEvents == 6,
         "shared sources grouped, inversion remains separate");
    size_t members = 0, checks = 0;
    for (const auto &g : inventory->groups) { members += g.members.size(); checks += g.checks.size(); }
    need(members == 6 && checks == 6 && inventory->processedChecks == 6, "complete index accounting");
    std::stop_source stop; stop.request_stop();
    auto cancelled = inventorySources(*r, {}, stop.get_token());
    need(!cancelled && cancelled.error().code == hier::ErrorCode::Cancelled, "pre-cancel error only");
    auto expired = detail::inventoryWithDeadline(*r, {}, {}, {});
    need(bool(expired) && !expired->complete && expired->work == 0 && expired->processedChecks == 0, "deterministic expired deadline");
    InventoryLimits limits; limits.maxMembers = 1;
    auto capped = inventorySources(*r, limits);
    members = 0; for (const auto &g : capped->groups) members += g.members.size();
    need(!capped->complete && members == 1 && capped->processedChecks == 6, "member prefix without discarding groups");
    limits = {}; limits.maxWork = 1;
    auto work = inventorySources(*r, limits); need(bool(work) && !work->complete && work->work == 1, "global projection work cap");
    limits = {}; limits.maxMillis = 0;
    need(!inventorySources(*r, limits), "validate time before chrono conversion");
    auto malformed = *r; malformed.registers[0].clockCheck = 9999;
    need(!inventorySources(malformed), "reject bad event index");
    malformed = *r; malformed.registers[0].asyncChecks.clear();
    need(!inventorySources(malformed), "reject async shape mismatch");
    malformed = *r; malformed.checks.push_back(malformed.checks[0]);
    need(!inventorySources(malformed), "reject duplicate point identity");
    auto again = inventorySources(*r); need(bool(again) && again->complete, "reuse after error has no global state");
    const struct ScenarioSource oldName = inventory->groups[0].source;
    r = hier::Error{hier::ErrorCode::Internal, "discard original"};
    need(!oldName.kind.empty() && !inventory->groups[0].source.point->slice.ref.empty() && inventory->groups[0].members.size(),
         "source and index values own data after input destruction; original type spelling compiles");
    std::cout << "Source inventory ownership, identity, budgets, cancellation and malformed input passed\n";
    return 0;
} catch (const std::exception &e) { std::cerr << e.what() << '\n'; return 1; }
