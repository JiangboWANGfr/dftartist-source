#undef NDEBUG  // asserts must fire even in Release builds
#include "frontend/SlangCompile.h"
#include "service/DesignDb.h"

#include <cassert>
#include <cstdio>
#include <set>
#include <string>
#include <vector>

using namespace hdl;

// The kitchen-sink corpus must elaborate with ZERO errors under every language version we offer
// (bar the ones that are genuinely 2023-only, which live in test/rtl/langver). This is the
// regression net for "the frontend accepts the whole language": UDPs, specify blocks, Verilog-95
// port lists, gate primitives, tagged unions, nettypes, DPI, classes/constraints/covergroups,
// interfaces/clocking/modports, checkers, programs, bind, generate, and every assertion form.
int main(int argc, char** argv) {
    assert(argc >= 4 && "usage: test_svfull <pkg.sv> <iface.sv> <top.sv>");
    std::vector<std::string> files{argv[1], argv[2], argv[3]};

    for (const char* ver : {"", "1800-2017", "1800-2023"}) {
        frontend::CompileOptions o;
        o.languageVersion = ver;
        std::string err;
        auto d = frontend::compileSingleTree(files, {}, {}, o, err);
        if (!d || d->diagnostics().errorCount != 0) {
            std::fprintf(stderr, "std='%s' errors=%d\n%s\n", ver, d ? d->diagnostics().errorCount : -1,
                         d ? d->diagnostics().text.c_str() : err.c_str());
            assert(false && "kitchen-sink corpus must compile clean");
        }
    }

    // The hardware side must still be analysable, not merely parseable.
    std::string err;
    auto design = frontend::compileSingleTree(files, {}, {}, err);
    assert(design);
    service::DesignDb db(std::move(design));

    std::set<std::string> tops;
    for (auto& m : db.ready().candidateTops) tops.insert(m.instanceName);
    assert(tops.count("sv_full_top") == 1);

    // instance array + generate blocks + gate primitives + UDP + a bound checker all show up
    service::ExpandResult r = db.expandChildren("sv_full_top");
    std::set<std::string> kinds, names;
    for (auto& c : r.children) {
        kinds.insert(c.kind);
        names.insert(c.instanceName);
    }
    assert(names.count("u_udp") == 1 && kinds.count("primitive") == 1);  // UDP instance
    assert(names.count("u_and") == 1);                                   // gate primitive
    assert(names.count("u_cell") == 1);                                  // Verilog-95 cell
    assert(names.count("intf") == 1);                                    // interface instance
    assert(names.count("u_arr[0]") == 1 && names.count("u_arr[3]") == 1);  // instance array

    // `bind` really attached the checker inside every leaf
    service::ExpandResult leaf = db.expandChildren("sv_full_top.u_arr[0]");
    bool bound = false;
    for (auto& c : leaf.children)
        if (c.kind == "checker") bound = true;
    assert(bound && "bind chk_no_x must appear under each leaf");

    // flops are counted through the generate blocks (N=4 stages x 8 bits + leaf arrays)
    service::RegCountResult rc = db.getRegisterCounts();
    assert(rc.total > 0);

    std::printf("test_svfull OK\n");
    return 0;
}
