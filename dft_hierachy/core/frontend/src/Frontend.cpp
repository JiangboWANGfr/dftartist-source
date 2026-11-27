#include "hier/frontend/Frontend.h"
#include "Connections.h"
#include "ChildSlots.h"
#include "AnalysisSlotRouting.h"
#include "Sources.h"
#include "TypeLayout.h"

#include <algorithm>
#include <filesystem>
#include <map>
#include <set>
#include <unordered_map>

#include <slang/ast/Compilation.h>
#include <slang/ast/symbols/BlockSymbols.h>
#include <slang/ast/symbols/CompilationUnitSymbols.h>
#include <slang/ast/symbols/InstanceSymbols.h>
#include <slang/ast/symbols/MemberSymbols.h>
#include <slang/ast/symbols/ParameterSymbols.h>
#include <slang/ast/symbols/PortSymbols.h>
#include <slang/ast/types/AllTypes.h>
#include <slang/diagnostics/DiagnosticEngine.h>
#include <slang/driver/Driver.h>
#include <slang/text/SourceManager.h>
#include <slang/util/VersionInfo.h>

using namespace slang;
using namespace slang::ast;

namespace hier::frontend {

// Body sharing is only enabled for the exact slang whose caching conditions were
// verified; see SHARING_VERIFIED.md. Building against anything else turns sharing off
// rather than silently trusting a different implementation.
std::string frontendVersion() {
    return std::to_string(VersionInfo::getMajor()) + "." + std::to_string(VersionInfo::getMinor()) +
           "." + std::to_string(VersionInfo::getPatch());
}

FrontendIdentity linkedFrontend() {
    return {frontendVersion(), std::string(VersionInfo::getPrerelease()), HIER_SLANG_SOURCE_ID};
}

FrontendIdentity verifiedFrontend() {
    // slang v12.0, commit 545f88b2ed3a2d20325fbd17413af177a6bca72f. The source id is
    // what cmake/Slang.cmake computes for that commit.
    return {"12.0.0", "", "07b9237d652d3a61abd674ae487791fcd97fc0b0a896a6c797b879f4620480db"};
}

std::string sharingBlockedReason(const FrontendIdentity &actual, const FrontendIdentity &verified) {
    auto differs = [](const char *what, const std::string &got, const std::string &want) {
        return std::string("slang ") + what + " is '" + got +
               "' but body sharing was verified for '" + want + "'";
    };
    if (actual.sourceId.empty())
        return "slang source id is unknown";
    if (actual.version != verified.version)
        return differs("version", actual.version, verified.version);
    if (actual.prerelease != verified.prerelease)
        return differs("prerelease tag", actual.prerelease, verified.prerelease);
    if (actual.sourceId != verified.sourceId)
        return differs("source id", actual.sourceId, verified.sourceId);
    return "";
}

namespace {

using model::BodyId;

model::Direction direction(ArgumentDirection d) {
    switch (d) {
    case ArgumentDirection::In:
        return model::Direction::In;
    case ArgumentDirection::Out:
        return model::Direction::Out;
    case ArgumentDirection::InOut:
        return model::Direction::InOut;
    case ArgumentDirection::Ref:
        return model::Direction::Ref;
    }
    return model::Direction::Unknown;
}

model::InstKind instKind(DefinitionKind k) {
    switch (k) {
    case DefinitionKind::Interface:
        return model::InstKind::Interface;
    case DefinitionKind::Program:
        return model::InstKind::Program;
    default:
        return model::InstKind::Module;
    }
}

model::DefKind defKind(DefinitionKind k) {
    switch (k) {
    case DefinitionKind::Interface:
        return model::DefKind::Interface;
    case DefinitionKind::Program:
        return model::DefKind::Program;
    default:
        return model::DefKind::Module;
    }
}

// Declared dimensions, outermost first.
void collectDims(const Type &type, std::vector<model::Dim> &out) {
    const Type *t = &type.getCanonicalType();
    while (true) {
        if (t->kind == SymbolKind::FixedSizeUnpackedArrayType) {
            auto &a = t->as<FixedSizeUnpackedArrayType>();
            out.push_back({a.range.left, a.range.right, false});
            t = &a.elementType.getCanonicalType();
        } else if (t->kind == SymbolKind::PackedArrayType) {
            auto &a = t->as<PackedArrayType>();
            out.push_back({a.range.left, a.range.right, true});
            t = &a.elementType.getCanonicalType();
        } else {
            return;
        }
    }
}

using detail::RawSlot;
using detail::SlotWalker;

class SlangFrontend final : public Frontend {
  public:
    Result<bool> open(const model::OpenOptions &options) {
        std::vector<std::string> args = {"hier"};
        auto add = [&](const char *flag, const std::vector<std::string> &values) {
            for (auto &v : values) {
                args.emplace_back(flag);
                args.push_back(v);
            }
        };
        for (auto &f : options.files)
            args.push_back(f);
        add("-f", options.filelists);
        add("-F", options.filelistsRelativeToFile);
        add("-D", options.defines);
        add("-I", options.includeDirs);
        add("-y", options.libraryDirs);
        add("-Y", options.libraryExts);
        add("--top", options.tops);
        if (options.singleUnit)
            args.emplace_back("--single-unit");
        if (options.unknownModulesAreBlackboxes)
            args.emplace_back("--ignore-unknown-modules");
        if (!options.defaultTimescale.empty()) {
            args.emplace_back("--timescale");
            args.push_back(options.defaultTimescale);
        }
        // Elaborate everything regardless of how many errors there are: a design with
        // errors is still browsable, and body sharing is only known after a full visit.
        args.emplace_back("--error-limit");
        args.emplace_back("0");

        std::vector<const char *> argv;
        for (auto &a : args)
            argv.push_back(a.c_str());

        driver_.addStandardArgs();
        if (!driver_.parseCommandLine(int(argv.size()), argv.data()) || !driver_.processOptions())
            return Error{ErrorCode::BadRequest, "invalid design inputs or options"};
        inputs_.arguments.assign(args.begin() + 1, args.end());
        inputs_.defines = driver_.options.defines;
        inputs_.undefines = driver_.options.undefines;
        inputs_.explicitTops = driver_.options.topModules;
        const auto identity = linkedFrontend();
        inputs_.frontendIdentity =
            identity.version + ":" + identity.prerelease + ":" + identity.sourceId;
        // Slang exposes the expanded sources / defines, but not every option
        // contributed by nested command files or per-unit environment expansion.
        // Their captured physical bytes still enter the hash. Never claim full
        // coverage for those files or an opaque LibraryProvider.
        inputs_.complete = options.filelists.empty() && options.filelistsRelativeToFile.empty() &&
                           !options.library;
        // Parse errors are reported through diagnostics(); whatever parsed is still opened.
        (void)driver_.parseAllSources();
        comp_ = driver_.createCompilation();
        libraryProvider_ = options.library;

        info_.name = "slang";
        info_.version = frontendVersion();
        if (options.forcePerInstanceBodies) {
            info_.sharedBodiesReason = "disabled by option";
        } else {
            info_.sharedBodiesReason = sharingBlockedReason(linkedFrontend(), verifiedFrontend());
            info_.sharedBodies = info_.sharedBodiesReason.empty();
        }

        // The pinned Slang extension runs after its complete sharing proof, but
        // before diagnostic coalescing. Visit only final semantic representatives;
        // binding may issue diagnostics that must enter that first collection.
        comp_->getSemanticDiagnostics([this] {
            numberBodies();
            libraryInputs_ = bindLibraryInputs(bodies_, libraryCells_);
        });
        comp_->getAllDiagnostics();
        try {
            sources_ = std::make_unique<SourceCatalog>(*comp_->getSourceManager());
        } catch (const std::filesystem::filesystem_error &error) {
            return Error{ErrorCode::BadRequest, error.what()};
        }
        for (const auto &path : driver_.sourceLoader.getFilePaths()) {
            std::error_code error;
            auto normalized = std::filesystem::weakly_canonical(path, error);
            if (error) {
                inputs_.complete = false;
                normalized = path.lexically_normal();
            }
            inputs_.sourceOrder.push_back(normalized.string());
        }
        for (const auto &name : queriedLibraryCells_) {
            const auto found = libraryCells_.find(name);
            inputs_.libraryCells.emplace(
                name, found == libraryCells_.end() ? std::nullopt : std::optional(found->second));
        }
        libraryProvider_.reset();
        return true;
    }

    const model::FrontendInfo &info() const override { return info_; }
    const std::vector<model::TopInfo> &tops() const override { return tops_; }
    size_t bodyCount() const override { return bodies_.size(); }
    const std::vector<model::DefInfo> &definitions() const override { return defs_; }

    std::vector<model::SourceFileInput> sourceFiles() const override { return sources_->files(); }
    model::CompilationInputs compilationInputs() const override { return inputs_; }
    std::vector<std::optional<model::SourceRange>> definitionSources() const override {
        std::vector<std::optional<model::SourceRange>> result(defs_.size());
        for (auto &[def, index] : defIndex_)
            result[index] = sources_->range(def->getSyntax());
        return result;
    }

    model::BodySkeleton skeleton(BodyId id) const override {
        const InstanceBodySymbol &body = *bodies_.at(id);
        model::BodySkeleton sk;
        sk.def = defIndex_.at(&body.getDefinition());
        sk.kind = instKind(body.getDefinition().definitionKind);

        for (auto p : body.getParameters())
            sk.params.push_back(param(*p));
        for (auto p : body.getPortList())
            sk.ports.push_back(port(*p));

        SlotWalker walker;
        walker.walk(body, -1);
        auto internals = extractPortInternals(body);
        for (size_t i = 0; i < sk.ports.size(); ++i)
            sk.ports[i].internal = std::move(internals[i]);
        sk.scopes = std::move(walker.scopes);
        for (auto &raw : walker.slots)
            sk.slots.push_back(slot(raw));
        return sk;
    }

    model::Diagnostics diagnostics(size_t maxItems) const override {
        return diagnostics(maxItems, {}).value();
    }
    Result<model::Diagnostics> diagnostics(size_t maxItems, Cancel cancel) const override {
        if (cancel.stop_requested())
            return Error{ErrorCode::Cancelled, "diagnostics cancelled"};
        model::Diagnostics out;
        auto &engine = driver_.diagEngine;
        auto &sm = *comp_->getSourceManager();
        std::vector<model::Diagnostic> errors, warnings;
        for (auto &d : comp_->getAllDiagnostics()) {
            if (cancel.stop_requested())
                return Error{ErrorCode::Cancelled, "diagnostics cancelled"};
            auto severity = engine.getSeverity(d.code, d.location);
            if (severity < DiagnosticSeverity::Warning)
                continue;
            bool isError = severity >= DiagnosticSeverity::Error;
            (isError ? out.errorCount : out.warningCount)++;
            auto &bucket = isError ? errors : warnings;
            if (bucket.size() >= maxItems)
                continue;
            model::Diagnostic item;
            item.isError = isError;
            item.message = engine.formatMessage(d);
            if (d.location) {
                auto loc = sm.getFullyExpandedLoc(d.location);
                item.file = std::string(sm.getFileName(loc));
                item.line = uint32_t(sm.getLineNumber(loc));
            }
            bucket.push_back(std::move(item));
        }
        for (auto *bucket : {&errors, &warnings}) {
            for (auto &item : *bucket) {
                if (cancel.stop_requested())
                    return Error{ErrorCode::Cancelled, "diagnostics cancelled"};
                if (out.items.size() < maxItems)
                    out.items.push_back(std::move(item));
            }
        }
        out.truncated = out.items.size() < out.errorCount + out.warningCount;
        return out;
    }

    model::BodyConnections connections(model::BodyId id) const override {
        if (!analysis_) {
            analysis_ = driver_.runAnalysis(*comp_);
        }
        SlotWalker walker;
        walker.walk(*bodies_.at(id), -1);
        std::vector<const Symbol *> slots;
        for (auto &s : walker.slots)
            slots.push_back(s.symbol);
        return extractConnections(*bodies_.at(id), slots, *analysis_, external_, libraryCells_,
                                  libraryInputs_, analyzedBody(*bodies_.at(id)), *sources_);
    }

  private:
    // A child under a noncanonical parent can itself have no canonical link: Slang
    // analyzes only the parent's representative subtree. Follow the same slot through
    // that subtree; definition names and parameter text are not sharing keys.
    const InstanceBodySymbol *analyzedBody(const InstanceBodySymbol &body) const {
        if (analysis_->getAnalyzedScope(body))
            return &body;
        if (auto found = analysisBodies_.find(&body); found != analysisBodies_.end())
            return found->second;
        analysisBodies_.emplace(&body, nullptr); // Recursion guard for erroneous designs.
        try {
            const InstanceBodySymbol *result = nullptr;
            if (auto inst = body.parentInstance) {
                if (auto canonical = inst->getCanonicalBody(); canonical && canonical != &body)
                    result = analyzedBody(*canonical);
                if (!result) {
                    auto scope = inst->getParentScope();
                    while (scope && scope->asSymbol().kind != SymbolKind::InstanceBody)
                        scope = scope->asSymbol().getParentScope();
                    if (scope) {
                        auto &parent = scope->asSymbol().as<InstanceBodySymbol>();
                        if (auto parentRepresentative = analyzedBody(parent)) {
                            auto corresponding = analysisSlotRoutes_.counterpart(
                                parent, *parentRepresentative, *inst, [](const auto &scope) {
                                    SlotWalker walker;
                                    walker.walk(scope, -1);
                                    return std::move(walker.slots);
                                });
                            if (corresponding && corresponding != &body)
                                result = analyzedBody(*corresponding);
                        }
                    }
                }
            }
            analysisBodies_[&body] = result;
            return result;
        } catch (...) {
            // An in-progress recursion marker is not a completed negative lookup.
            analysisBodies_.erase(&body);
            throw;
        }
    }
    mutable std::unordered_map<const InstanceBodySymbol *, const InstanceBodySymbol *>
        analysisBodies_;
    mutable std::unique_ptr<analysis::AnalysisManager> analysis_;
    mutable ExternalAccess external_;
    std::unordered_set<const InstanceBodySymbol *> externalBodies_;
    std::shared_ptr<const model::LibraryProvider> libraryProvider_;
    model::CompilationInputs inputs_;
    std::map<std::string, model::CellInfo> libraryCells_;
    std::set<std::string> queriedLibraryCells_;
    LibraryInputBindings libraryInputs_;
    // The body whose content describes this instance. With sharing on, that is the
    // canonical body slang proved identical, except where the body has interface ports
    // (kept unshared in the first version, docs/DESIGN.md 4.1).
    const InstanceBodySymbol &bodyOf(const InstanceSymbol &inst) const {
        if (!info_.sharedBodies)
            return inst.body;
        auto canonical = inst.getCanonicalBody();
        if (!canonical)
            return inst.body;
        if (externalBodies_.contains(&inst.body) || externalBodies_.contains(canonical))
            return inst.body;
        for (auto p : inst.body.getPortList()) {
            if (p->kind == SymbolKind::InterfacePort)
                return inst.body;
        }
        return *canonical;
    }

    // The definition table (docs/DESIGN.md 4.3): every definition, of every kind, in one
    // order: by name, then file, then line. Blackboxes and primitives have no file and
    // take part in the same ordering; they are not appended as separate groups.
    void buildDefinitions(const std::set<std::string> &blackboxes,
                          const std::set<std::string> &primitives) {
        struct Entry {
            model::DefInfo info;
            const DefinitionSymbol *def; // null for a blackbox or primitive
        };
        auto &sm = *comp_->getSourceManager();
        std::vector<Entry> entries;
        for (auto sym : comp_->getDefinitions()) {
            if (sym->kind != SymbolKind::Definition)
                continue;
            auto &def = sym->as<DefinitionSymbol>();
            entries.push_back({{std::string(def.name), defKind(def.definitionKind),
                                std::string(sm.getFileName(def.location)),
                                uint32_t(sm.getLineNumber(def.location))},
                               &def});
        }
        for (auto &name : blackboxes)
            entries.push_back({{name, model::DefKind::Blackbox, "", 0}, nullptr});
        for (auto &name : primitives)
            entries.push_back({{name, model::DefKind::Primitive, "", 0}, nullptr});

        std::sort(entries.begin(), entries.end(), [](const Entry &x, const Entry &y) {
            return std::tie(x.info.name, x.info.file, x.info.line, x.info.kind) <
                   std::tie(y.info.name, y.info.file, y.info.line, y.info.kind);
        });
        for (auto &e : entries) {
            auto index = uint32_t(defs_.size());
            if (e.def)
                defIndex_[e.def] = index;
            else if (e.info.kind == model::DefKind::Blackbox)
                blackboxIndex_[e.info.name] = index;
            else
                primitiveIndex_[e.info.name] = index;
            defs_.push_back(std::move(e.info));
        }
    }

    void loadLibraryCell(const std::string &name) {
        if (libraryProvider_ && queriedLibraryCells_.insert(name).second)
            if (auto cell = libraryProvider_->cell(name))
                libraryCells_.emplace(name, std::move(*cell));
    }

    // Builds the definition table, then numbers every body depth-first from the tops.
    void numberBodies() {
        std::vector<const InstanceSymbol *> tops(comp_->getRoot().topInstances.begin(),
                                                 comp_->getRoot().topInstances.end());
        std::sort(tops.begin(), tops.end(), [](auto a, auto b) { return a->name < b->name; });

        // Scan unique semantic representatives first. External references make
        // their source / target / ancestors occurrence-dependent; walk again to
        // discover only newly exposed bodies until the choice is stable. With no
        // external references, this never enters duplicate instance subtrees.
        std::unordered_set<const InstanceBodySymbol *> scanned;
        std::set<std::string> blackboxes, primitives;
        while (true) {
            std::vector<const InstanceBodySymbol *> fresh, work;
            std::unordered_set<const InstanceBodySymbol *> seen;
            for (auto top : tops)
                work.push_back(&bodyOf(*top));
            while (!work.empty()) {
                auto body = work.back();
                work.pop_back();
                if (!seen.insert(body).second)
                    continue;
                if (scanned.insert(body).second)
                    fresh.push_back(body);
                SlotWalker walker;
                walker.walk(*body, -1);
                for (auto &slot : walker.slots) {
                    auto symbol = slot.symbol;
                    if (symbol->kind == SymbolKind::Instance)
                        work.push_back(&bodyOf(symbol->as<InstanceSymbol>()));
                    else if (symbol->kind == SymbolKind::UninstantiatedDef)
                        blackboxes.insert(
                            std::string(symbol->as<UninstantiatedDefSymbol>().definitionName));
                    else if (symbol->kind == SymbolKind::PrimitiveInstance)
                        primitives.insert(
                            std::string(symbol->as<PrimitiveInstanceSymbol>().primitiveType.name));
                }
            }
            if (fresh.empty())
                break;
            // Freeze library directions before interpreting connection accesses.
            for (auto &name : blackboxes)
                loadLibraryCell(name);
            auto accesses = collectExternal(fresh, libraryCells_, &externalBodies_);
            for (auto &[symbol, flags] : accesses)
                external_[symbol] |= flags;
            std::vector<const InstanceBodySymbol *> affected(externalBodies_.begin(),
                                                             externalBodies_.end());
            for (auto body : affected) {
                while (auto inst = body->parentInstance) {
                    auto scope = inst->getParentScope();
                    while (scope && scope->asSymbol().kind != SymbolKind::InstanceBody)
                        scope = scope->asSymbol().getParentScope();
                    if (!scope)
                        break;
                    body = &scope->asSymbol().as<InstanceBodySymbol>();
                    externalBodies_.insert(body);
                }
            }
        }
        buildDefinitions(blackboxes, primitives);

        for (auto top : tops)
            tops_.push_back({std::string(top->name), number(bodyOf(*top))});
    }

    BodyId number(const InstanceBodySymbol &body) {
        if (auto it = bodyIds_.find(&body); it != bodyIds_.end())
            return it->second;
        BodyId id = BodyId(bodies_.size());
        bodyIds_[&body] = id;
        bodies_.push_back(&body);
        SlotWalker walker;
        walker.walk(body, -1);
        for (auto &raw : walker.slots) {
            if (raw.symbol->kind == SymbolKind::Instance)
                number(bodyOf(raw.symbol->as<InstanceSymbol>()));
        }
        return id;
    }

    model::ChildSlot slot(const RawSlot &raw) const {
        model::ChildSlot s;
        s.scope = raw.scope;
        s.arrayIndex = raw.arrayIndex;
        switch (raw.symbol->kind) {
        case SymbolKind::Instance: {
            auto &inst = raw.symbol->as<InstanceSymbol>();
            s.name = std::string(inst.getArrayName());
            s.kind = instKind(inst.getDefinition().definitionKind);
            s.def = defIndex_.at(&inst.getDefinition());
            s.body = bodyIds_.at(&bodyOf(inst));
            for (auto p : inst.body.getParameters()) {
                if (p->symbol.kind == SymbolKind::Parameter
                        ? p->symbol.as<ParameterSymbol>().isOverridden()
                        : p->symbol.as<TypeParameterSymbol>().isOverridden())
                    s.overriddenParams.emplace_back(p->symbol.name);
            }
            break;
        }
        case SymbolKind::UninstantiatedDef: {
            auto &u = raw.symbol->as<UninstantiatedDefSymbol>();
            s.name = std::string(u.name);
            s.kind = model::InstKind::Blackbox;
            s.def = blackboxIndex_.at(std::string(u.definitionName));
            auto cell = libraryCells_.find(std::string(u.definitionName));
            s.blackboxPins =
                blackboxPinNames(u, cell == libraryCells_.end() ? nullptr : &cell->second);
            break;
        }
        default: {
            auto &prim = raw.symbol->as<PrimitiveInstanceSymbol>();
            s.name = std::string(prim.getArrayName());
            s.kind = model::InstKind::Primitive;
            s.def = primitiveIndex_.at(std::string(prim.primitiveType.name));
            for (size_t i = 0; i < prim.getPortConnections().size(); ++i)
                s.blackboxPins.push_back(std::to_string(i));
            break;
        }
        }
        return s;
    }

    static model::ParamInfo param(const ParameterSymbolBase &p) {
        model::ParamInfo out;
        out.name = std::string(p.symbol.name);
        out.isLocal = p.isLocalParam();
        out.isPort = p.isPortParam();
        if (p.symbol.kind == SymbolKind::Parameter) {
            auto &v = p.symbol.as<ParameterSymbol>();
            // The elaborated VALUE, never the override expression: that expression is
            // written in the parent's scope and differs between instances whose values
            // are equal (SHARING_VERIFIED.md).
            out.value = v.getValue().toString();
            out.typeText = v.getType().toString();
        } else {
            auto &t = p.symbol.as<TypeParameterSymbol>();
            out.isType = true;
            out.value = t.targetType.getType().toString();
        }
        return out;
    }

    static model::PortInfo port(const Symbol &sym) {
        model::PortInfo out;
        out.name = std::string(sym.name);
        auto fillType = [&](const Type &type) {
            out.typeText = type.toString();
            out.width = bitWidth(type);
            out.isSigned = type.isSigned();
            collectDims(type, out.dims);
            out.members = typeMembers(type);
        };
        switch (sym.kind) {
        case SymbolKind::Port: {
            auto &p = sym.as<PortSymbol>();
            out.direction = direction(p.direction);
            fillType(p.getType());
            break;
        }
        case SymbolKind::MultiPort: {
            auto &p = sym.as<MultiPortSymbol>();
            out.kind = model::PortKind::Multi;
            out.direction = direction(p.direction);
            fillType(p.getType());
            break;
        }
        case SymbolKind::InterfacePort: {
            auto &p = sym.as<InterfacePortSymbol>();
            out.kind = model::PortKind::Interface;
            if (p.interfaceDef)
                out.interfaceDef = std::string(p.interfaceDef->name);
            out.modport = std::string(p.modport);
            break;
        }
        default:
            break;
        }
        return out;
    }

    mutable driver::Driver driver_;
    std::unique_ptr<Compilation> comp_;
    std::unique_ptr<SourceCatalog> sources_;
    model::FrontendInfo info_;
    std::vector<model::TopInfo> tops_;
    std::vector<model::DefInfo> defs_;
    std::vector<const InstanceBodySymbol *> bodies_;
    std::unordered_map<const InstanceBodySymbol *, BodyId> bodyIds_;
    std::unordered_map<const DefinitionSymbol *, uint32_t> defIndex_;
    std::map<std::string, uint32_t> blackboxIndex_, primitiveIndex_;
    // This metadata dies before comp_, whose AST owns every key and value.
    mutable detail::AnalysisSlotRouting analysisSlotRoutes_;
};

} // namespace

Result<std::unique_ptr<Frontend>> openDesign(const model::OpenOptions &options) {
    auto fe = std::make_unique<SlangFrontend>();
    auto opened = fe->open(options);
    if (!opened)
        return opened.error();
    return std::unique_ptr<Frontend>(std::move(fe));
}

} // namespace hier::frontend
