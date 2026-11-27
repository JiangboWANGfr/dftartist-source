#pragma once
#include "hier/model/Source.h"
#include "hier/model/Library.h"
#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace hier::model {
struct Dim {
    int32_t left = 0;
    int32_t right = 0;
    bool packed = true;
};
struct BitRange {
    uint64_t lsb = 0, width = 0;
    bool operator==(const BitRange &) const = default;
};
struct MemberInfo {
    std::string name, typeText;
    BitRange bits;
    bool isSigned = false;
    std::vector<Dim> dims;
    std::vector<MemberInfo> members;
};
struct Slice {
    std::string ref;
    BitRange bits;
    bool operator==(const Slice &) const = default;
};
struct Reason {
    std::string code, at, detail;
};
struct Completeness {
    std::string status = "complete";
    std::vector<Reason> reasons;
};
template <class T> struct QueryResult {
    T result;
    Completeness completeness;
};
struct Dep {
    std::string signal;
    BitRange bits;
    std::string role = "data", precision = "exact", align = "bitwise";
    bool operator==(const Dep &) const = default;
};
struct BitMapSegment {
    uint64_t from = 0, to = 0, width = 0;
};
struct ExprMapping {
    std::string status = "mapped";
    std::vector<BitMapSegment> segments;
    std::string reason;
};
struct Write {
    Slice target;
    std::vector<Dep> deps;
    // Absolute root RHS result bits -> absolute target bits; separate from deps.
    std::optional<ExprMapping> exprMap = {};
};
struct BindTarget {
    std::string kind = "unconnected", signal, value, process, reason;
    BitRange bits;
};
struct BindSegment {
    BitRange pinBits;
    BindTarget target;
};
struct PortInternal {
    std::string kind = "unresolved", signal, status = "complete", reason, expr;
    BitRange bits;
    std::vector<BindSegment> segments;
};
struct PinBinding {
    std::string inst, pin, port, direction = "unknown";
    std::optional<uint64_t> width;
    std::vector<BindSegment> segments;
    std::string unresolved;
    std::map<std::string, std::string> attrs;
    std::optional<CellInfo> cell;
    // Extraction metadata for unknown-direction nontrivial lvalues. These are
    // possible parent writes, without any claimed pin-to-target bit mapping.
    // Not part of the serialized binding representation.
    std::vector<Slice> possibleWrites = {};
};
struct LocalNetlist {
    std::string inst;
    std::vector<PinBinding> bindings;
};
struct SignalInfo {
    std::string ref, name, kind, typeText, localPath;
    uint64_t width = 0;
    bool isSigned = false, opaque = false;
    std::vector<Dim> dims;
    std::vector<MemberInfo> members;
    bool externalRead = false, externalWrite = false;
};
struct ExternalRef {
    std::string text, access;
};
struct Expr {
    std::string op, text, value;
    Slice slice;
    std::vector<Expr> args;
    std::vector<Dep> uses;
    std::optional<uint64_t> width = {};
    bool isSigned = false;
};
struct ProcessSummary {
    std::string ref, kind;
};
struct ProcessInfo {
    std::string ref, kind, inst;
    std::vector<Write> writes;
    std::optional<Expr> expr;
    std::vector<ExternalRef> externalRefs;
};
struct EventInfo {
    std::string signal;
    BitRange bits;
    std::string edge, type;
};
struct RegisterInfo {
    std::string ref, inst, signal, process;
    BitRange bits;
    EventInfo clock;
    std::vector<EventInfo> async;
};
struct ObjectInfo {
    std::string ref, kind, name, inst, pathText;
};
struct TracePoint {
    Slice slice;
    std::optional<std::string> side;
};
struct Continuation {
    Slice slice;
    std::string role = "data", precision = "exact";
    BitRange from = {};
    std::optional<std::string> side = {};
    std::string align = "bitwise";
    std::vector<BitMapSegment> map = {};
};
struct Hop {
    std::string kind, via, reason;
    std::optional<CellInfo> cell;
    Slice from;
    std::vector<BitMapSegment> map;
    std::vector<Continuation> next;
    std::string fact;
    std::optional<TracePoint> at;
    std::optional<std::string> value;
};
struct Endpoint {
    std::string kind, ref, inst, value, reason;
    BitRange queried;
    std::optional<BitRange> bits;
    std::optional<Slice> at;
    std::vector<Hop> via; // M2 boundary routes; M3 step-only metadata is not populated.
};
struct StepResult {
    std::vector<Hop> hops;
    std::string next;
    bool hasConservative = false;
};
struct FactCheck {
    uint64_t slangCompared = 0, selfChecked = 0, skippedExternal = 0, mismatched = 0;
    std::vector<std::string> issues;
};

// Body-relative references: s::N / x::N / r::N belong to this body;
// p:S:N and i:S refer to child slot S. No Slang pointers escape L1.
// L3 qualifies a copy with the occurrence's InstKey before returning it.
struct BodyConnections {
    std::vector<SignalInfo> signals;
    std::vector<PortInternal> internals;
    std::vector<PinBinding> bindings;
    std::vector<QueryResult<ProcessInfo>> processes;
    std::vector<RegisterInfo> registers;
    std::vector<SourceRecord> sources;
    FactCheck check;
    Completeness completeness;
    size_t estimatedBytes = 0;
};
} // namespace hier::model
