#pragma once
#include "hier/model/Connections.h"
#include <slang/analysis/AnalysisManager.h>
#include <slang/ast/symbols/InstanceSymbols.h>
#include <span>
#include <unordered_map>
#include <unordered_set>

namespace hier::frontend {
class SourceCatalog;
using ExternalAccess = std::unordered_map<const slang::ast::ValueSymbol *, unsigned>;
// Borrowed ASTs owned by the Compilation, bound once during open, never per cache fill.
using LibraryInputBindings =
    std::map<std::pair<const slang::ast::Expression *, uint64_t>, const slang::ast::Expression *>;
LibraryInputBindings bindLibraryInputs(
    std::span<const slang::ast::InstanceBodySymbol *const> bodies,
    const std::map<std::string, model::CellInfo> &library);
ExternalAccess collectExternal(
    std::span<const slang::ast::InstanceBodySymbol *const> bodies,
    const std::map<std::string, model::CellInfo> &library,
    std::unordered_set<const slang::ast::InstanceBodySymbol *> *affectedBodies = nullptr);
std::vector<std::string> blackboxPinNames(const slang::ast::UninstantiatedDefSymbol &inst,
                                          const model::CellInfo *cell);
std::vector<model::PortInternal> extractPortInternals(const slang::ast::InstanceBodySymbol &body);
model::BodyConnections extractConnections(const slang::ast::InstanceBodySymbol &body,
                                          std::span<const slang::ast::Symbol *const> slots,
                                          const slang::analysis::AnalysisManager &analysis,
                                          const ExternalAccess &external,
                                          const std::map<std::string, model::CellInfo> &library,
                                          const LibraryInputBindings &libraryInputs,
                                          const slang::ast::InstanceBodySymbol *analyzedBody,
                                          const SourceCatalog &sources);
} // namespace hier::frontend
