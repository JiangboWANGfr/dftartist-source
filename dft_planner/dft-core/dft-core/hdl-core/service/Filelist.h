#pragma once
#include <string>
#include <utility>
#include <vector>

namespace hdl::service {

struct FilelistResult {
    std::vector<std::string> files;    // resolved source paths (oracle order)
    /// `-v FILE`: a LIBRARY file. Verilog semantics — its modules are compiled only where they are
    /// instantiated and never become a design top, unlike a plain source line.
    std::vector<std::string> libfiles;
    std::vector<std::string> defines;  // +define+NAME=VAL  -> "NAME=VAL"
    std::vector<std::string> incdirs;  // +incdir+DIR       -> resolved dir
    std::vector<std::string> libdirs;  // -y DIR            -> resolved dir (module search path)
    std::vector<std::string> libexts;  // +libext+.v+.sv    -> {".v", ".sv"} (deduped, dot-prefixed)
    std::string langVersion;           // --std 1800-2023   -> "1800-2023" ("" = tool default)
};

// Parse a filelist (or directory) with Hierarchyshower var/subst, classifying standard options
// (+define+ / +incdir+ / +libext+ / -y / -f nested filelists / -v lib file / --std). varmap/substs
// are ordered. `-y`, `-v` and `--std` also accept their argument on the FOLLOWING line (a filelist
// is a whitespace-separated token stream for the commercial tools, so `-y\nDIR` is as valid as
// `-y DIR`); `--std=X`, `-std=X` and `--std X` are all accepted.
// No options present -> result.files matches the old behavior exactly (oracle parity preserved).
FilelistResult parseFilelist(const std::string& path,
                             const std::vector<std::pair<std::string, std::string>>& varmap,
                             const std::vector<std::pair<std::string, std::string>>& substs);

}  // namespace hdl::service
