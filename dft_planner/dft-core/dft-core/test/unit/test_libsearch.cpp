#undef NDEBUG  // asserts must fire even in Release builds
#include "frontend/SlangCompile.h"
#include "service/DesignDb.h"
#include "service/Filelist.h"

#include <cassert>
#include <cstdio>
#include <set>
#include <string>

using namespace hdl;

static bool endsWith(const std::string& s, const std::string& suffix) {
    return s.size() >= suffix.size() && s.compare(s.size() - suffix.size(), suffix.size(), suffix) == 0;
}

static bool anyEndsWith(const std::vector<std::string>& v, const std::string& suffix) {
    for (auto& s : v)
        if (endsWith(s, suffix)) return true;
    return false;
}

int main(int argc, char** argv) {
    assert(argc >= 2 && "usage: test_libsearch <test/rtl/libsearch/files.f>");
    const std::string flPath = argv[1];

    // ---- 1. the filelist classifies -y (incl. next-line argument) and +libext+ ----------------
    service::FilelistResult fl = service::parseFilelist(flPath, {}, {});
    assert(fl.files.size() == 1 && endsWith(fl.files[0], "top.sv"));  // library files are NOT sources
    assert(fl.libfiles.size() == 1 && endsWith(fl.libfiles[0], "cell_lib.v"));  // -v
    assert(fl.libdirs.size() == 3);
    assert(endsWith(fl.libdirs[0], "cells"));
    assert(endsWith(fl.libdirs[1], "mem"));  // "-y" alone + dir on the next line
    assert(endsWith(fl.libdirs[2], "no_such_dir"));
    assert(fl.libexts.size() == 1 && fl.libexts[0] == ".vlib");

    // ---- 2. without the search path the design cannot elaborate -------------------------------
    std::string err0;
    auto bare = frontend::compileSingleTree(fl.files, fl.defines, fl.incdirs, err0);
    assert(bare && "top.sv itself must parse");
    assert(bare->diagnostics().errorCount > 0 && "unknown modules must be reported when -y is ignored");
    {
        // The instances degrade to blackboxes: top has no children it can see into.
        service::DesignDb db(std::move(bare));
        service::ExpandResult r = db.expandChildren("top");
        for (auto& c : r.children) assert(c.isLeaf && "blackbox instance must be a leaf");
    }

    // ---- 3. with -y / +libext+ everything resolves, recursively -------------------------------
    std::string err;
    frontend::CompileOptions copts;
    copts.lib = {fl.libdirs, fl.libexts, fl.libfiles};
    auto design = frontend::compileSingleTree(fl.files, fl.defines, fl.incdirs, copts, err);
    assert(design && "compile failed");
    assert(design->diagnostics().errorCount == 0 && "library search must resolve every unknown module");

    assert(anyEndsWith(design->libraryFiles, "cell_and2.v"));  // direct hit, default .v
    assert(anyEndsWith(design->libraryFiles, "cell_inv.v"));   // pulled in BY a library file
    assert(anyEndsWith(design->libraryFiles, "mem_1k.vlib"));  // needed +libext+.vlib
    assert(design->libraryFiles.size() == 3);   // -y hits only
    assert(design->libTrees.size() == 4);       // + the one named by -v

    // a stale -y dir is reported, not fatal
    assert(design->missingLibDirs.size() == 1 && endsWith(design->missingLibDirs[0], "no_such_dir"));

    service::DesignDb db(std::move(design));

    // ---- 4. library modules never become design tops ------------------------------------------
    service::ReadyInfo ready = db.ready();
    std::set<std::string> tops;
    for (auto& m : ready.candidateTops) tops.insert(m.instanceName);
    assert(tops.count("top") == 1);
    assert(tops.count("cell_unused_top") == 0 &&
           "an uninstantiated module inside a -y file is a library unit, not a root");
    assert(tops.count("cell_never_used") == 0 && "same for an uninstantiated module in a -v file");
    assert(tops.size() == 1);

    // ---- 5. the resolved cells are real hierarchy, not blackboxes -----------------------------
    service::ExpandResult r = db.expandChildren("top");
    std::set<std::string> kids;
    for (auto& c : r.children) kids.insert(c.instanceName);
    assert(kids.count("u_and") == 1 && kids.count("u_mem") == 1 && kids.count("u_or") == 1);
    for (auto& c : r.children)
        if (c.instanceName == "u_and")
            assert(!c.isLeaf && "resolved cell_and2 has a child cell -> not a blackbox leaf");

    service::ExpandResult r2 = db.expandChildren("top.u_and");
    assert(r2.children.size() == 1 && r2.children[0].instanceName == "u_inv");

    // u_mem IS a leaf (mem_1k instantiates nothing) — what proves it is not a blackbox is that
    // its body was elaborated: an unresolved module has no registers at all.
    service::RegCountResult rc = db.getRegisterCounts();
    int memOwn = -1;
    for (auto& c : rc.counts)
        if (c.instanceId == "top.u_mem") memOwn = c.own;
    assert(memOwn == 8);      // mem_1k's 8-bit output register, counted from the library file
    assert(rc.total == 9);    // 8 + top's own q flop

    std::printf("test_libsearch OK\n");
    return 0;
}
