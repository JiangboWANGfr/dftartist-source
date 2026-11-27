#include "service/Filelist.h"

#include <cassert>
#include <cstdio>
#include <filesystem>
#include <fstream>

using namespace hdl::service;
namespace fs = std::filesystem;

static void writeFile(const std::string& p, const std::string& c) { std::ofstream(p) << c; }

int main() {
    fs::path dir = fs::temp_directory_path() / "hdl_fltest";
    fs::remove_all(dir);
    fs::create_directories(dir);

    // file mode: comments, options classified, var + relative resolution
    writeFile((dir / "a.sv").string(), "module a; endmodule");
    writeFile((dir / "b.v").string(), "module b; endmodule");
    std::string fl = (dir / "files.f").string();
    writeFile(fl,
              "// comment\n"
              "+define+USE_A=1\n"
              "+incdir+${SRC}/inc\n"
              "-y bar\n"
              "+libext+.vlib+sv2\n"  // dot optional
              "${SRC}/a.sv\n"
              "b.v\n");
    auto r = parseFilelist(fl, {{"SRC", dir.string()}}, {});
    assert(r.files.size() == 2);
    assert(r.files[0] == (dir / "a.sv").string());  // ${SRC} expanded
    assert(r.files[1] == (dir / "b.v").string());   // relative -> joined to filelist dir
    assert(r.defines.size() == 1 && r.defines[0] == "USE_A=1");
    assert(r.incdirs.size() == 1 && r.incdirs[0] == (dir / "inc").string());  // +incdir resolved
    assert(r.libdirs.size() == 1);                                            // -y bar
    assert(r.libdirs[0] == (dir / "bar").string());                           // resolved
    assert(r.libexts.size() == 2 && r.libexts[0] == ".vlib" && r.libexts[1] == ".sv2");

    // "-y" / "-v" with the argument on the next line; a dangling one is dropped, not swallowed
    std::string fl2 = (dir / "split.f").string();
    writeFile(fl2,
              "-y\n"
              "libdir\n"
              "-v\n"
              "b.v\n"
              "-y\n"
              "+define+X\n"
              "a.sv\n");
    auto r3 = parseFilelist(fl2, {}, {});
    assert(r3.libdirs.size() == 1 && r3.libdirs[0] == (dir / "libdir").string());
    assert(r3.files.size() == 2);  // b.v (via -v) + a.sv
    assert(r3.files[0] == (dir / "b.v").string());
    assert(r3.files[1] == (dir / "a.sv").string());
    assert(r3.defines.size() == 1 && r3.defines[0] == "X");  // not eaten by the dangling -y

    // directory mode: headers (.svh/.vh) before sources (.v/.sv), each sorted; no options
    fs::path d2 = dir / "rtl";
    fs::create_directories(d2);
    writeFile((d2 / "z.v").string(), "module z; endmodule");
    writeFile((d2 / "a.v").string(), "module a2; endmodule");
    writeFile((d2 / "h.svh").string(), "// header");
    auto r2 = parseFilelist(d2.string(), {}, {});
    assert(r2.files.size() == 3);
    assert(r2.files[0].ends_with("h.svh"));  // header first
    assert(r2.files[1].ends_with("a.v"));    // sources sorted
    assert(r2.files[2].ends_with("z.v"));

    std::printf("test_filelist OK\n");
    return 0;
}
