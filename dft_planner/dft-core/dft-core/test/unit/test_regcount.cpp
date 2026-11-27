#undef NDEBUG  // asserts must fire even in Release builds
#include "frontend/SlangCompile.h"
#include "service/DesignDb.h"

#include <cassert>
#include <cstdio>
#include <map>
#include <string>

using namespace hdl;

static const service::RegCount& find(const std::map<std::string, service::RegCount>& m,
                                     const std::string& id) {
    auto it = m.find(id);
    if (it == m.end()) { std::fprintf(stderr, "missing instance %s\n", id.c_str()); assert(false); }
    return it->second;
}

int main(int argc, char** argv) {
    assert(argc >= 2 && "usage: test_regcount <regcount.sv>");
    std::string parseErr;
    auto design = frontend::compileSingleTree({argv[1]}, {}, {}, parseErr);
    assert(design && "compile failed");
    service::DesignDb db(std::move(design));

    service::RegCountResult rc = db.getRegisterCounts();
    std::map<std::string, service::RegCount> by;
    for (auto& c : rc.counts) by[c.instanceId] = c;

    assert(find(by, "top.u_leaf").own == 32);
    assert(find(by, "top.u_leaf").subtree == 32);
    assert(find(by, "top.u_comb").own == 0);
    assert(find(by, "top.u_dedup").own == 8);   // deduped across two always_ff blocks
    assert(find(by, "top.u_mem").own == 0);
    assert(find(by, "top.u_mem").memoryBits == 2048);
    assert(find(by, "top.u_incr").own == 4);       // x++ inside always_ff (unary inc/dec)
    assert(find(by, "top.u_incr").subtree == 4);
    assert(find(by, "top.u_struct").own == 24);    // x.a, y.a, z.a[1] -> base vars (full width each)
    assert(find(by, "top.u_struct").subtree == 24);
    assert(find(by, "top").own == 4);
    assert(find(by, "top").subtree == 72);
    assert(rc.total == 72);
    std::printf("test_regcount OK (total=%d)\n", rc.total);
    return 0;
}
