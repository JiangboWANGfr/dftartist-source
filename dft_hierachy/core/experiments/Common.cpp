#include "Common.h"

#include <sys/resource.h>

#include <algorithm>

#include <map>

#include <slang/ast/Scope.h>
#include <slang/diagnostics/DiagnosticEngine.h>
#include <slang/ast/symbols/BlockSymbols.h>
#include <slang/ast/symbols/CompilationUnitSymbols.h>

using namespace slang;
using namespace slang::ast;

namespace hexp {

double seconds(std::chrono::steady_clock::time_point since) {
    return std::chrono::duration<double>(std::chrono::steady_clock::now() - since).count();
}

long peakRssMb() {
    rusage u{};
    getrusage(RUSAGE_SELF, &u);
#ifdef __APPLE__
    return u.ru_maxrss / (1024 * 1024);  // bytes
#else
    return u.ru_maxrss / 1024;  // kilobytes
#endif
}

Loaded load(int argc, char** argv) {
    Loaded l;
    l.driver = std::make_unique<driver::Driver>();
    l.driver->addStandardArgs();
    if (!l.driver->parseCommandLine(argc, argv) || !l.driver->processOptions())
        std::exit(2);
    auto t = std::chrono::steady_clock::now();
    if (!l.driver->parseAllSources())
        std::fprintf(stderr, "note: parse reported errors\n");
    l.comp = l.driver->createCompilation();
    l.parseSeconds = seconds(t);
    return l;
}

static void walkScope(const Scope& scope,
                      const std::function<void(const InstanceSymbol&)>& fn) {
    for (auto& m : scope.members()) {
        switch (m.kind) {
            case SymbolKind::Instance: {
                auto& inst = m.as<InstanceSymbol>();
                fn(inst);
                walkScope(inst.body, fn);
                break;
            }
            case SymbolKind::InstanceArray:
                walkScope(m.as<InstanceArraySymbol>(), fn);
                break;
            case SymbolKind::GenerateBlock:
                if (!m.as<GenerateBlockSymbol>().isUninstantiated)
                    walkScope(m.as<GenerateBlockSymbol>(), fn);
                break;
            case SymbolKind::GenerateBlockArray:
                walkScope(m.as<GenerateBlockArraySymbol>(), fn);
                break;
            default:
                break;
        }
    }
}

void forEachInstance(Compilation& comp,
                     const std::function<void(const InstanceSymbol&)>& fn) {
    for (auto top : comp.getRoot().topInstances) {
        fn(*top);
        walkScope(top->body, fn);
    }
}

size_t reportDiagnostics(Loaded& l) {
    auto& engine = l.driver->diagEngine;
    size_t errors = 0, warnings = 0;
    std::map<std::string, size_t> byMessage;
    for (auto& d : l.comp->getAllDiagnostics()) {
        if (engine.getSeverity(d.code, d.location) >= DiagnosticSeverity::Error) {
            errors++;
            byMessage[engine.formatMessage(d)]++;
        }
        else {
            warnings++;
        }
    }
    std::printf("diagnostics: %zu errors, %zu warnings\n", errors, warnings);
    std::vector<std::pair<size_t, std::string>> top;
    for (auto& [m, n] : byMessage)
        top.emplace_back(n, m);
    std::sort(top.rbegin(), top.rend());
    for (size_t i = 0; i < std::min<size_t>(8, top.size()); i++)
        std::printf("  %5zu x %s\n", top[i].first, top[i].second.c_str());
    return errors;
}

int cmdDiags(Loaded& l) {
    return reportDiagnostics(l) ? 1 : 0;
}

}  // namespace hexp
