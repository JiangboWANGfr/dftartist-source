#undef NDEBUG  // asserts must fire even in Release builds
#include "frontend/SlangCompile.h"
#include "service/DesignDb.h"

#include <cassert>
#include <cstdio>
#include <map>
#include <string>

using namespace hdl;

int main(int argc, char** argv) {
    assert(argc >= 2 && "usage: test_checker <checker/top.sv>");
    std::string parseErr;
    auto design = frontend::compileSingleTree({argv[1]}, {}, {}, parseErr);
    assert(design && "compile failed");
    assert(design->diagnostics().errorCount == 0);
    service::DesignDb db(std::move(design));

    // `top` has TWO children: the sub-module and the checker instance (which used to vanish).
    service::ExpandResult r = db.expandChildren("top");
    std::map<std::string, service::Meta> by;
    for (auto& c : r.children) by[c.instanceName] = c;
    assert(r.children.size() == 2);
    assert(by.count("u_sub") == 1 && by["u_sub"].kind == "module");
    assert(by.count("u_chk") == 1);
    assert(by["u_chk"].kind == "checker");
    assert(by["u_chk"].isLeaf && "a checker holds assertions, not hardware -> never walked into");
    // it is identified by the checker's own name, not lumped in with primitives
    assert(by["u_chk"].definitionId.rfind("no_x_on_d|", 0) == 0);

    // The checker must not disturb the hardware analyses: only sub's flop is counted, and
    // expanding the checker node yields nothing rather than throwing.
    service::RegCountResult rc = db.getRegisterCounts();
    assert(rc.total == 1);
    assert(db.expandChildren("top.u_chk").children.empty());

    std::printf("test_checker OK\n");
    return 0;
}
