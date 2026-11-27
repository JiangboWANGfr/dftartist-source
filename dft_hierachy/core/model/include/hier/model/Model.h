#pragma once
#include "hier/model/Connections.h"
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

// L0: pure data. No algorithms, no IO, no frontend types (docs/DESIGN.md 3.2, 4).
namespace hier::model {

// ---- what the user asks to open -------------------------------------------------

struct OpenOptions {
    std::vector<std::string> files;
    std::vector<std::string> filelists;               // paths inside resolve against the cwd
    std::vector<std::string> filelistsRelativeToFile; // paths inside resolve against the filelist
    std::vector<std::string> defines;                 // "NAME" or "NAME=VALUE"
    std::vector<std::string> includeDirs;
    std::vector<std::string> libraryDirs;
    std::vector<std::string> libraryExts;
    std::vector<std::string> tops; // empty = infer

    // Both default on, as the tool this replaces behaves (docs/M0_RESULTS.md 4):
    // macros defined in one listed file are visible in the next, and a module that is
    // instantiated but never defined becomes a blackbox instead of an error.
    bool singleUnit = true;
    bool unknownModulesAreBlackboxes = true;

    // Applied to design elements that declare no timescale, so that a design mixing
    // files with and without `timescale still elaborates. Empty = do not supply one.
    std::string defaultTimescale = "1ns/1ns";

    // Never share one extraction between instances, even where it is known to be safe.
    // For diagnosing suspected sharing problems (docs/DESIGN.md 4.1).
    bool forcePerInstanceBodies = false;
    std::shared_ptr<const LibraryProvider> library;
    size_t connectionCacheBytes = 64 * 1024 * 1024;
};

// ---- skeleton facts of one module body (docs/DESIGN.md 4.2) ----------------------

enum class PortKind { Port, Interface, Multi };
enum class InstKind { Module, Interface, Program, Blackbox, Primitive };
enum class DefKind { Module, Interface, Program, Blackbox, Primitive };

// One dimension of a declared type, outermost first: `logic [7:0] m [0:3]` is
// {unpacked 0:3}, {packed 7:0}.

struct PortInfo {
    std::string ref;
    PortInternal internal;
    std::map<std::string, std::string> attrs;
    std::string name;
    Direction direction = Direction::Unknown;
    PortKind kind = PortKind::Port;
    std::string typeText; // "logic[15:8]"
    uint64_t width = 0;   // size of the bit space; 0 when the type has none
    bool isSigned = false;
    std::vector<Dim> dims;
    std::vector<MemberInfo> members;
    std::string interfaceDef; // kind == Interface
    std::string modport;      // kind == Interface, may be empty
};

struct ParamInfo {
    std::string name;
    std::string value;    // the elaborated value; for a type parameter, the type
    std::string typeText; // empty for a type parameter
    bool isType = false;
    bool isLocal = false;
    bool isPort = false; // declared in the parameter port list
    // Whether this instance overrides the default. A property of the INSTANCE, not of
    // the body: it is false in BodySkeleton and filled in by the query layer from the
    // instantiating slot, because instances that share a body can differ in it.
    bool isOverridden = false;
};

// A generate block or one iteration of a generate loop, inside a body.
struct ScopeInfo {
    int32_t parent = -1;             // index into BodySkeleton::scopes, -1 = the body itself
    std::string name;                // "g_fast"; "genblk1" for an unnamed block
    std::vector<int32_t> arrayIndex; // one iteration of a generate loop: "g_loop[2]" -> {2}
};

using BodyId = uint32_t;
inline constexpr BodyId kNoBody = ~BodyId{0};

// A position in a body where a child is instantiated. Its index in
// BodySkeleton::slots is one level of an instance key (docs/DESIGN.md 4.2).
struct ChildSlot {
    std::string name;                // "u", without array indices
    std::vector<int32_t> arrayIndex; // "u[3][1]" -> {3, 1}
    int32_t scope = -1;              // index into BodySkeleton::scopes, -1 = the body itself
    InstKind kind = InstKind::Module;
    uint32_t def = 0;                          // index into the definition table
    BodyId body = kNoBody;                     // kNoBody for a blackbox or primitive
    std::vector<std::string> overriddenParams; // names of the parameters this instantiation sets
    std::vector<std::string> blackboxPins;     // Blackbox: pin names used at this instantiation
};

struct BodySkeleton {
    uint32_t def = 0;
    InstKind kind = InstKind::Module;
    std::vector<ParamInfo> params;
    std::vector<PortInfo> ports;
    std::vector<ScopeInfo> scopes;
    std::vector<ChildSlot> slots;
};

struct DefInfo {
    std::string name;
    DefKind kind = DefKind::Module;
    std::string file; // empty for a blackbox or primitive
    uint32_t line = 0;
};

struct TopInfo {
    std::string name;
    BodyId body = kNoBody;
};

struct FrontendInfo {
    std::string name;    // "slang"
    std::string version; // "12.0.0"
    // Whether instances proven to have the same body share one extraction ("fast") or
    // every instance is extracted on its own (docs/DESIGN.md 4.1).
    bool sharedBodies = false;
    std::string sharedBodiesReason; // why not, when sharedBodies is false
};

struct Diagnostic {
    bool isError = false;
    std::string message;
    std::string file;
    uint32_t line = 0;
};

struct Diagnostics {
    size_t errorCount = 0;
    size_t warningCount = 0;
    std::vector<Diagnostic> items; // errors first; capped
    bool truncated = false;
};

// ---- query results (docs/DESIGN.md 5.2) -----------------------------------------

struct InstInfo {
    std::string ref;               // opaque: "i:0.3.12"
    std::string name;              // last path segment, "u[3]"
    std::vector<std::string> path; // segments from the top, unescaped
    std::string pathText;          // "top.g[2].\a.b .u[3]"
    InstKind kind = InstKind::Module;
    std::string def; // opaque: "d:17"
    std::string defName;
    uint32_t childCount = 0;
    bool hasParamOverrides = false;
};

struct DefSummary {
    std::string ref; // "d:17"
    std::string name;
    DefKind kind = DefKind::Module;
    std::string file;
    uint32_t line = 0;
};

struct SnapshotInfo {
    int schemaVersion = 0;
    FrontendInfo frontend;
    std::vector<InstInfo> tops;
    size_t definitionCount = 0;
    size_t bodyCount = 0;
    std::string snapshotId;
    std::string inputHash;
    bool inputHashComplete = false;
    std::string indexState = "ready";
    std::string openedAt;
    std::vector<std::string> topCandidates;
};

} // namespace hier::model
