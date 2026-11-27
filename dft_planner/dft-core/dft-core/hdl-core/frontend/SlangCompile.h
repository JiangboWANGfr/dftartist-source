#pragma once
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace slang {
class SourceManager;
}
namespace slang::syntax {
class SyntaxTree;
}
namespace slang::ast {
class Compilation;
}

namespace hdl::frontend {

// Library module search (`-y DIR` + `+libext+`): where to look for a module that is instantiated
// but never declared in the filelist's own files. This is how a commercial filelist points at a
// standard-cell / memory / vendor-IP directory instead of listing every file in it.
struct LibrarySearch {
    std::vector<std::string> dirs;   // -y DIR (searched for <moduleName><ext>)
    std::vector<std::string> exts;   // +libext+ (".v" and ".sv" are always searched too)
    /// -v FILE: parsed up front but as a LIBRARY unit — used only where instantiated, never a top.
    std::vector<std::string> files;
    bool empty() const { return dirs.empty() && files.empty(); }
};

struct CompileOptions {
    LibrarySearch lib;
    /// Language the lexer/parser/elaborator apply: "1364-2005" | "1800-2017" | "1800-2023".
    /// Empty = "1800-2023", the newest standard, so the widest syntax is accepted by default.
    /// 1364-2005 is the strict-Verilog mode an old netlist wants (`logic`, `bit`, `do` … stay
    /// usable as identifiers); 1800-2017 pins the behaviour of releases before this option existed.
    std::string languageVersion;

    /// Elaborate ONLY this module as the design top (empty = let slang infer every top).
    /// On a big corpus the inferred set includes every testbench, unused IP and cell wrapper,
    /// and slang elaborates all of them. Naming the top is the single cheapest way to make the
    /// cost proportional to the design the user actually opened.
    std::string topModule;
};

/// Elaboration diagnostics. Producing them makes slang elaborate and semantically check the WHOLE
/// design, which on a large SoC is the most expensive single thing hdl-core can do — so they are
/// computed on demand (see Design::diagnostics()) rather than at load, and cached afterwards.
struct DesignDiagnostics {
    int errorCount = 0;
    int totalDiagnostics = 0;   // errors + warnings + notes
    bool truncated = false;     // more diagnostics than the format cap
    std::string text;           // formatted (file:line), capped
};

// Owns SourceManager + tree for the Compilation's lifetime.
struct Design {
    std::unique_ptr<slang::SourceManager> sm;
    std::shared_ptr<slang::syntax::SyntaxTree> tree;
    /// Trees pulled in on demand from the `-y` search path. They are LIBRARY units: their modules
    /// are only elaborated where instantiated and never become top-level candidates, so pointing
    /// -y at a 5000-cell library does not add 5000 fake roots.
    std::vector<std::shared_ptr<slang::syntax::SyntaxTree>> libTrees;
    std::unique_ptr<slang::ast::Compilation> comp;
    std::vector<std::string> missingFiles;  // filelist paths that don't exist (skipped, tolerated)
    std::vector<std::string> libraryFiles;  // files resolved through -y (what the search found)
    std::vector<std::string> missingLibDirs;  // -y dirs that don't exist (searched nothing)
    /// Owns the string slang's CompilationOptions::topModules holds a view of.
    std::string topModule;
    /// The requested top matched no module, so it was dropped and the tops inferred instead.
    bool topModuleIgnored = false;

    /// Lazy + cached. THE FIRST CALL ELABORATES THE WHOLE DESIGN — do not call it on a load path
    /// that only needs candidate tops or one expanded subtree.
    const DesignDiagnostics& diagnostics() const;
    /// Whether diagnostics() has already run, i.e. whether asking is free.
    bool diagnosticsComputed() const { return diags_.has_value(); }

    Design();
    ~Design();  // out-of-line: destroys unique_ptrs where slang types are complete

private:
    mutable std::optional<DesignDiagnostics> diags_;
};

// Single SyntaxTree from all files (matches pyslang SyntaxTree.fromFiles), with optional
// +define+ macros and +incdir+ include dirs. Empty defines+incdirs == old behavior (oracle parity).
std::unique_ptr<Design> compileSingleTree(const std::vector<std::string>& files,
                                          const std::vector<std::string>& defines,
                                          const std::vector<std::string>& incdirs,
                                          std::string& parseError);

// As above, plus on-demand resolution of unknown modules from the `-y` search path (library files
// are preprocessed with the same +define+/+incdir+ as the main sources, what VCS/Xcelium do) and
// an explicit language version. A default-constructed CompileOptions is byte-identical to the
// 4-arg overload. An unrecognised languageVersion fails the compile via parseError.
std::unique_ptr<Design> compileSingleTree(const std::vector<std::string>& files,
                                          const std::vector<std::string>& defines,
                                          const std::vector<std::string>& incdirs,
                                          const CompileOptions& opts, std::string& parseError);

}  // namespace hdl::frontend
