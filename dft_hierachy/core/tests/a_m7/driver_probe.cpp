// Native dependency regression: retain diagnostics and every tracked driver.
// Used unchanged against the original and covered Slang static libraries.
#include <cstdio>
#include <cstdlib>
#include <slang/analysis/AnalysisManager.h>
#include <slang/analysis/ValueDriver.h>
#include <slang/ast/Compilation.h>
#include <slang/ast/symbols/CompilationUnitSymbols.h>
#include <slang/ast/symbols/InstanceSymbols.h>
#include <slang/ast/symbols/VariableSymbols.h>
#include <slang/driver/Driver.h>

int main(int argc, char **argv) {
    slang::driver::Driver driver;
    driver.addStandardArgs();
    if (!driver.parseCommandLine(argc, argv) || !driver.processOptions() ||
        !driver.parseAllSources())
        return 2;
    auto compilation = driver.createCompilation();
    const auto &initial = compilation->getAllDiagnostics();
    if (!initial.empty()) {
        std::fputs(slang::DiagnosticEngine::reportAll(*compilation->getSourceManager(), initial).c_str(),
                   stderr);
        return 3;
    }
    auto analysis = driver.runAnalysis(*compilation);
    const auto diagnostics = analysis->getDiagnostics();
    std::printf("diagnostics %zu\n", diagnostics.size());
    for (const auto &diagnostic : diagnostics) {
        std::printf("diag %u %s\n", unsigned(diagnostic.code.getCode()),
                    driver.diagEngine.formatMessage(diagnostic).c_str());
        for (const auto &note : diagnostic.notes)
            std::printf("note %u %s\n", unsigned(note.code.getCode()),
                        driver.diagEngine.formatMessage(note).c_str());
    }
    const auto &tops = compilation->getRoot().topInstances;
    if (tops.size() != 1)
        return 4;
    const char *symbolPath = std::getenv("HIER_A_DRIVER_SYMBOL");
    auto symbol = tops.front()->body.lookupName(symbolPath ? symbolPath : "n");
    if (!symbol || !slang::ast::ValueSymbol::isKind(symbol->kind))
        return 5;
    const auto drivers = analysis->getDrivers(symbol->as<slang::ast::ValueSymbol>());
    std::printf("drivers %zu\n", drivers.size());
    for (const auto *item : drivers) {
        const auto bounds = item->getBounds();
        std::printf("driver %llu %llu %d %d %s\n",
                    static_cast<unsigned long long>(bounds.first),
                    static_cast<unsigned long long>(bounds.second), item->isUnidirectionalPort(),
                    item->flags.has(slang::analysis::DriverFlags::Initializer),
                    item->containingSymbol->getHierarchicalPath().c_str());
    }
}
