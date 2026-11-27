#pragma once
#include <chrono>
#include <functional>
#include <memory>
#include <string>
#include <vector>

#include <slang/ast/Compilation.h>
#include <slang/ast/symbols/InstanceSymbols.h>
#include <slang/driver/Driver.h>

namespace hexp {

struct Loaded {
    std::unique_ptr<slang::driver::Driver> driver;
    std::unique_ptr<slang::ast::Compilation> comp;
    double parseSeconds = 0;
};

// Parses slang-style arguments (-f filelist, +incdir+, -y, --top ...) and creates the
// compilation. Nothing is elaborated yet.
Loaded load(int argc, char** argv);

double seconds(std::chrono::steady_clock::time_point since);
long peakRssMb();

// Calls fn for every module/interface instance, parents before children. Walks each
// instance's OWN body (never the canonical one), so hierarchical paths are real.
void forEachInstance(slang::ast::Compilation& comp,
                     const std::function<void(const slang::ast::InstanceSymbol&)>& fn);

// Elaborates the whole design and prints error/warning counts with the most common
// errors. Returns the number of errors.
size_t reportDiagnostics(Loaded&);

int cmdFiles(Loaded&);
int cmdSharing(Loaded&);
int cmdScale(Loaded&);
int cmdDiags(Loaded&);
int cmdScaleFolded(Loaded&);
int cmdDrivers(Loaded&);
int cmdClockStat(Loaded&);

}  // namespace hexp
