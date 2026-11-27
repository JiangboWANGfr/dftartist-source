#undef NDEBUG  // asserts must fire even in Release builds
#include "frontend/SlangCompile.h"
#include "service/DesignDb.h"
#include "service/Filelist.h"

#include <cassert>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <string>

using namespace hdl;

static frontend::CompileOptions with(const std::string& ver) {
    frontend::CompileOptions o;
    o.languageVersion = ver;
    return o;
}

int main(int argc, char** argv) {
    assert(argc >= 3 && "usage: test_langver <sv2023.sv> <v2005.v>");
    const std::string sv2023 = argv[1], v2005 = argv[2];

    // ---- the DEFAULT is the newest standard: the 2023-only construct just works ----------------
    std::string e;
    auto ddef = frontend::compileSingleTree({sv2023}, {}, {}, e);
    assert(ddef && ddef->diagnostics().errorCount == 0 && "default must accept 1800-2023 syntax");
    auto d2023 = frontend::compileSingleTree({sv2023}, {}, {}, with("1800-2023"), e);
    assert(d2023 && d2023->diagnostics().errorCount == 0 && "1800-2023 must reach the lexer/parser");
    auto d2023short = frontend::compileSingleTree({sv2023}, {}, {}, with("2023"), e);
    assert(d2023short && d2023short->diagnostics().errorCount == 0);  // bare-year alias

    // ---- pinning the older standard really does reject it --------------------------------------
    auto d2017 = frontend::compileSingleTree({sv2023}, {}, {}, with("1800-2017"), e);
    assert(d2017 && d2017->diagnostics().errorCount > 0 && "`union soft` is not legal before 1800-2023");

    // ---- 1364-2005 really is strict Verilog: SV keywords stop being keywords -------------------
    auto sv = frontend::compileSingleTree({v2005}, {}, {}, with("1800-2017"), e);
    assert(sv && sv->diagnostics().errorCount == 0);
    auto v05 = frontend::compileSingleTree({v2005}, {}, {}, with("1364-2005"), e);
    assert(v05 && v05->diagnostics().errorCount > 0 && "always_ff/logic are not 1364-2005 keywords");

    // ---- an unknown version fails loudly instead of silently using the default -----------------
    std::string bad;
    auto none = frontend::compileSingleTree({v2005}, {}, {}, with("1800-2039"), bad);
    assert(!none && bad.find("1800-2039") != std::string::npos);

    // ---- the filelist carries it: --std=X, -std=X, and "--std" + next line ---------------------
    namespace fs = std::filesystem;
    fs::path dir = fs::temp_directory_path() / "hdl_langver";
    fs::remove_all(dir);
    fs::create_directories(dir);
    auto write = [](const fs::path& p, const std::string& c) { std::ofstream(p) << c; };

    write(dir / "eq.f", "--std=1800-2023\n" + sv2023 + "\n");
    write(dir / "short.f", "-std=2023\n" + sv2023 + "\n");
    write(dir / "split.f", "--std\n1800-2023\n" + sv2023 + "\n");
    write(dir / "outer.f", "--std=1364-2005\n-f inner.f\n");
    write(dir / "inner.f", "--std=1800-2023\n" + sv2023 + "\n");

    assert(service::parseFilelist((dir / "eq.f").string(), {}, {}).langVersion == "1800-2023");
    assert(service::parseFilelist((dir / "short.f").string(), {}, {}).langVersion == "2023");
    assert(service::parseFilelist((dir / "split.f").string(), {}, {}).langVersion == "1800-2023");
    assert(service::parseFilelist((dir / "outer.f").string(), {}, {}).langVersion == "1364-2005");

    // "-std" is matched as a whole token: a path-ish option keeps being ignored as unknown
    write(dir / "notstd.f", "-stdcells /some/dir\n" + sv2023 + "\n");
    service::FilelistResult ns = service::parseFilelist((dir / "notstd.f").string(), {}, {});
    assert(ns.langVersion.empty() && ns.files.size() == 1);

    service::FilelistResult fl = service::parseFilelist((dir / "eq.f").string(), {}, {});
    assert(fl.files.size() == 1);
    auto viaFilelist = frontend::compileSingleTree(fl.files, fl.defines, fl.incdirs,
                                                   with(fl.langVersion), e);
    assert(viaFilelist && viaFilelist->diagnostics().errorCount == 0);

    std::printf("test_langver OK\n");
    return 0;
}
