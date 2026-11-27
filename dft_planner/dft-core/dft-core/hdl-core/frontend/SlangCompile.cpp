#include "frontend/SlangCompile.h"

#include <filesystem>
#include <memory>

#include "slang/ast/Compilation.h"
#include "slang/ast/symbols/CompilationUnitSymbols.h"  // RootSymbol::topInstances
#include "slang/diagnostics/DiagnosticEngine.h"
#include "slang/diagnostics/Diagnostics.h"
#include "slang/diagnostics/TextDiagnosticClient.h"
#include "slang/driver/SourceLoader.h"
#include "slang/parsing/Lexer.h"
#include "slang/parsing/Parser.h"
#include "slang/parsing/Preprocessor.h"
#include "slang/syntax/SyntaxTree.h"
#include "slang/text/SourceLocation.h"
#include "slang/text/SourceManager.h"
#include "slang/util/Bag.h"
#include "slang/util/LanguageVersion.h"

namespace fs = std::filesystem;

namespace hdl::frontend {

Design::Design() = default;
Design::~Design() = default;

// Tolerance: cap how many diagnostics we format (large designs can have thousands).
static constexpr size_t kDiagCap = 100;

// Accepts the IEEE names and the bare year everyone actually types.
static bool parseLanguageVersion(const std::string& s, slang::LanguageVersion& out) {
    // Default = the NEWEST standard, so the widest set of syntax is accepted without the user
    // having to know a flag exists. Verified over the whole test corpus (30 files) plus the
    // svfull kitchen sink: 1800-2023 and 1800-2017 produce identical diagnostics on every one,
    // i.e. 2023 is purely additive here. --std 1800-2017 pins the old behaviour.
    if (s.empty() || s == "1800-2023" || s == "2023") {
        out = slang::LanguageVersion::v1800_2023;
        return true;
    }
    if (s == "1800-2017" || s == "2017") {
        out = slang::LanguageVersion::v1800_2017;
        return true;
    }
    if (s == "1364-2005" || s == "2005") {
        out = slang::LanguageVersion::v1364_2005;
        return true;
    }
    return false;
}

std::unique_ptr<Design> compileSingleTree(const std::vector<std::string>& files,
                                          const std::vector<std::string>& defines,
                                          const std::vector<std::string>& incdirs,
                                          std::string& parseError) {
    return compileSingleTree(files, defines, incdirs, CompileOptions{}, parseError);
}

std::unique_ptr<Design> compileSingleTree(const std::vector<std::string>& files,
                                          const std::vector<std::string>& defines,
                                          const std::vector<std::string>& incdirs,
                                          const CompileOptions& opts, std::string& parseError) {
    const LibrarySearch& lib = opts.lib;
    slang::LanguageVersion langVersion = slang::LanguageVersion::Default;
    if (!parseLanguageVersion(opts.languageVersion, langVersion)) {
        parseError = "unknown language version '" + opts.languageVersion +
                     "' (expected 1364-2005 | 1800-2017 | 1800-2023)";
        return nullptr;
    }

    auto d = std::make_unique<Design>();
    d->sm = std::make_unique<slang::SourceManager>();

    // Some flows write EVERY line of the filelist as `-v file`. Taken literally that is a design
    // made entirely of library units, i.e. no top at all and an empty tree. When there is nothing
    // else to be the design, the library files are the design.
    const std::vector<std::string>& sources = files.empty() ? lib.files : files;
    const std::vector<std::string> vFiles = files.empty() ? std::vector<std::string>{} : lib.files;

    // Tolerate missing files: skip them (recorded), parse what exists. A stale path in a
    // commercial filelist must not abort the whole load.
    std::vector<std::string> existing;
    for (auto& f : sources) {
        std::error_code ec;
        if (fs::is_regular_file(f, ec))
            existing.push_back(f);
        else
            d->missingFiles.push_back(f);
    }
    if (existing.empty()) {
        parseError = "no existing source files (" + std::to_string(d->missingFiles.size()) +
                     " missing)";
        return nullptr;
    }

    std::vector<std::string_view> views;
    views.reserve(existing.size());
    for (auto& f : existing) views.emplace_back(f);

    // The language version has to reach the LEXER (the keyword table differs per version) and the
    // PARSER, not just the elaborator, so all three get it.
    slang::Bag options;
    slang::parsing::PreprocessorOptions ppo;
    ppo.predefines = defines;
    ppo.languageVersion = langVersion;
    for (auto& dir : incdirs) ppo.additionalIncludePaths.emplace_back(dir);
    options.set(ppo);

    slang::parsing::LexerOptions lexo;
    lexo.languageVersion = langVersion;
    // Old vendor libraries (memories, PLLs, IO) ship their bodies inside a legacy `protected /
    // `endprotected envelope. Off, slang does not even recognise the directive and the encrypted
    // payload lands in the parser as garbage — one such file produced 11 errors and no module.
    // On, the envelope is skipped and the file contributes whatever is readable around it.
    lexo.enableLegacyProtect = true;
    // slang stops lexing a buffer after this many errors and DISCARDS the rest of the file. 16 is
    // far too eager for a read-only analysis tool: one malformed vendor header would silently
    // truncate the modules after it. Report a lot, give up on the file only if it is hopeless.
    lexo.maxErrors = 1000;
    options.set(lexo);

    slang::parsing::ParserOptions paro;
    paro.languageVersion = langVersion;
    options.set(paro);

    auto treeOrErr = slang::syntax::SyntaxTree::fromFiles(views, *d->sm, options);
    if (!treeOrErr) {
        parseError = std::string(treeOrErr.error().second);
        return nullptr;
    }
    d->tree = *treeOrErr;

    // ---- `-v FILE`: an explicitly named LIBRARY file ------------------------------------------
    // Each gets its own tree flagged as a library unit. Listing it as a plain source instead (what
    // we used to do) makes every module in a cell library an automatically-instantiated top
    // candidate, which is both wrong per Verilog and ruinous for top selection.
    std::vector<std::shared_ptr<slang::syntax::SyntaxTree>> vTrees;
    for (const auto& f : vFiles) {
        std::error_code ec;
        if (!fs::is_regular_file(f, ec)) {
            d->missingFiles.push_back(f);
            continue;
        }
        auto t = slang::syntax::SyntaxTree::fromFile(f, *d->sm, options);
        if (!t) {
            d->missingFiles.push_back(f);
            continue;
        }
        (*t)->isLibraryUnit = true;
        vTrees.push_back(*t);
        d->libTrees.push_back(*t);
    }

    // ---- `-y` / `+libext+`: resolve modules that are instantiated but never declared ----------
    // slang's own driver mechanism: walk the parsed trees for unknown module names, look each one
    // up as <libdir>/<name><ext>, parse it as a LIBRARY unit, and repeat (a library file may
    // itself instantiate another library module). Without this a filelist that leans on -y for
    // its cell/memory/IP models silently degrades into a tree full of blackboxes.
    if (!lib.dirs.empty()) {
        slang::driver::SourceLoader loader(*d->sm);
        for (const auto& dir : lib.dirs) {
            std::error_code ec;
            if (!fs::is_directory(dir, ec)) {
                d->missingLibDirs.push_back(dir);
                continue;
            }
            loader.addSearchDirectories(dir);
        }
        for (const auto& e : lib.exts) loader.addSearchExtension(e);

        if (d->missingLibDirs.size() < lib.dirs.size()) {
            std::vector<slang::BufferID> found;
            auto findBuffer = [&](std::string_view name) -> slang::SourceBuffer {
                slang::SourceBuffer buf = loader.findBuffer(name);
                if (buf) found.push_back(buf.id);
                return buf;
            };

            // The -v trees take part too: a module they instantiate is also resolvable from -y,
            // and a module the main sources want may already be declared in a -v file.
            std::vector<std::shared_ptr<slang::syntax::SyntaxTree>> trees{d->tree};
            trees.insert(trees.end(), vTrees.begin(), vTrees.end());
            const size_t firstResolved = trees.size();
            slang::driver::SourceLoader::loadTrees(trees, findBuffer, *d->sm, options);

            // Everything appended past the inputs came from the search path. Flag those as library
            // units ourselves so their modules can never be picked as a design top.
            for (size_t i = firstResolved; i < trees.size(); ++i) {
                trees[i]->isLibraryUnit = true;
                d->libTrees.push_back(trees[i]);
            }
            for (auto id : found) d->libraryFiles.push_back(d->sm->getFullPath(id).string());
        }
    }

    // Mixed corpora (vendor DFT IP with `timescale, plain RTL without) otherwise error on every
    // module ("design element does not have a time scale defined but others do") — hundreds of
    // errors that also poison downstream analysis. A default timescale is what every EDA tool
    // effectively applies here.
    slang::ast::CompilationOptions copts;
    copts.defaultTimeScale = slang::TimeScale::fromString("1ns/1ns");
    copts.languageVersion = langVersion;

    // Elaborate one named top instead of every inferred one. slang keeps a string_view, so the
    // name has to outlive the Compilation — it does, `opts` is owned by the caller for the whole
    // call and the Design keeps a copy.
    if (!opts.topModule.empty()) {
        d->topModule = opts.topModule;
        copts.topModules.emplace(d->topModule);
    }

    // Capacity limits. slang's defaults are sized for human-written RTL; a generated SoC blows
    // through them and the design simply fails to build. These are not speed knobs — they decide
    // whether a big design can be read at all. Each is a hard stop against runaway elaboration,
    // so they are raised, not removed.
    copts.maxInstanceArray = 1u << 22;    // 65535 -> 4M: `cell u[1000000] (...)` is a real netlist
    copts.maxGenerateSteps = 1u << 24;    // 131072 -> 16M: deep nested generate loops
    copts.maxInstanceDepth = 1024;        // 128: recursive-generate hierarchies get deep
    copts.maxConstexprSteps = 10000000;   // 1M: elaboration-time functions over big arrays
    copts.maxConstexprDepth = 512;        // 128: recursive $clog2-style helpers
    copts.maxDefParamSteps = 8192;        // 128
    copts.errorLimit = 0;                 // 64 -> unlimited; we cap what we FORMAT, not what we
                                          // count, so a partial design still reports honestly
    slang::Bag cbag;
    cbag.set(copts);
    auto build = [&](const slang::Bag& bag) {
        auto c = std::make_unique<slang::ast::Compilation>(bag);
        c->addSyntaxTree(d->tree);
        for (auto& t : d->libTrees) c->addSyntaxTree(t);
        return c;
    };
    d->comp = build(cbag);

    // Safety net for --top: a name that matches no module leaves slang with NO top instances, i.e.
    // an empty design. That is a much worse outcome than a slow one — and the name arrives from a
    // UI that may be holding a stale value — so fall back to inferring the tops. Only ever paid on
    // the wrong-name path, and the syntax trees are already parsed.
    if (!d->topModule.empty() && d->comp->getRoot().topInstances.empty()) {
        d->topModuleIgnored = true;
        copts.topModules.clear();
        slang::Bag retry;
        retry.set(copts);
        d->comp = build(retry);
    }

    return d;
}

const DesignDiagnostics& Design::diagnostics() const {
    if (diags_) return *diags_;
    DesignDiagnostics r;

    // getAllDiagnostics() elaborates and semantically checks EVERYTHING. That is why this whole
    // function is deferred: a session that only browses the hierarchy never pays for it.
    const slang::Diagnostics& diags = comp->getAllDiagnostics();
    r.totalDiagnostics = static_cast<int>(diags.size());
    for (const auto& dg : diags)
        if (dg.isError()) ++r.errorCount;

    if (!diags.empty()) {
        slang::DiagnosticEngine engine(*sm);
        auto client = std::make_shared<slang::TextDiagnosticClient>();
        client->showColors(false);
        engine.addClient(client);
        size_t n = 0;
        for (const auto& dg : diags) {
            if (n++ >= kDiagCap) {
                r.truncated = true;
                break;
            }
            engine.issue(dg);
        }
        r.text = client->getString();
    }
    diags_ = std::move(r);
    return *diags_;
}

}  // namespace hdl::frontend
