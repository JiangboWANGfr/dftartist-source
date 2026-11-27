#include "check.h"

#include "service/DesignDb.h"

namespace drc {

namespace {

// Check one clock/reset net: flag UNCTRL when it never reaches a primary input.
// "logic"/"instance" termini (internally generated/gated) are CLK-GEN/GATED — left to ④.3.
void checkNet(hdl::service::DesignDb& db, const hdl::service::SeqElement& el,
              const hdl::service::SeqEvent& ev, bool isClock, DrcReport& rep) {
    hdl::service::NetSourceResult ns = db.traceNetToSource(el.ownerInstanceId, ev.net);
    if (ns.terminus != "undriven") return;  // "pi" = controllable; "logic"/"instance" = ④.3

    Violation v;
    v.rule = isClock ? "CLK-UNCTRL" : "RST-UNCTRL";
    v.severity = "error";
    v.signal = ev.net;
    v.instanceId = el.ownerInstanceId;
    v.file = el.file;
    v.line = el.line;
    v.path = ns.path;
    std::string deadEnd = ns.path.empty() ? ev.net : ns.path.back();
    v.message = (isClock ? "clock '" : "async reset '") + ev.net +
                "' does not trace back to a primary input (dead-ends at " + deadEnd + ")";
    rep.violations.push_back(std::move(v));
}

}  // namespace

DrcReport runDrc(hdl::service::DesignDb& db) {
    DrcReport rep;
    for (const auto& el : db.getSequential()) {
        ++rep.flops;
        for (const auto& c : el.clocks) {
            ++rep.clocks;
            checkNet(db, el, c, /*isClock=*/true, rep);
        }
        for (const auto& r : el.asyncResets) {
            ++rep.resets;
            checkNet(db, el, r, /*isClock=*/false, rep);
        }
    }
    return rep;
}

}  // namespace drc
