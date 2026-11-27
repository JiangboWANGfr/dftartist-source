#include "hier/protocol/Json.h"

#include <cstdio>
#include <stdexcept>

namespace hier::protocol {

using namespace model;

void JsonWriter::separate() {
    if (afterKey_) {
        afterKey_ = false;
        return;
    }
    if (!first_.empty()) {
        if (!first_.back())
            out_ += ',';
        first_.back() = false;
    }
}

JsonWriter &JsonWriter::beginObject() {
    separate();
    out_ += '{';
    first_.push_back(true);
    return *this;
}

JsonWriter &JsonWriter::endObject() {
    out_ += '}';
    first_.pop_back();
    return *this;
}

JsonWriter &JsonWriter::beginArray() {
    separate();
    out_ += '[';
    first_.push_back(true);
    return *this;
}

JsonWriter &JsonWriter::endArray() {
    out_ += ']';
    first_.pop_back();
    return *this;
}

JsonWriter &JsonWriter::key(std::string_view name) {
    value(name);
    out_ += ':';
    afterKey_ = true;
    return *this;
}

JsonWriter &JsonWriter::value(std::string_view text) {
    separate();
    out_ += '"';
    for (char ch : text) {
        auto c = static_cast<unsigned char>(ch);
        switch (c) {
        case '"':
            out_ += "\\\"";
            break;
        case '\\':
            out_ += "\\\\";
            break;
        case '\n':
            out_ += "\\n";
            break;
        case '\r':
            out_ += "\\r";
            break;
        case '\t':
            out_ += "\\t";
            break;
        default:
            if (c < 0x20) {
                char buf[8];
                std::snprintf(buf, sizeof buf, "\\u%04x", c);
                out_ += buf;
            } else {
                out_ += ch;
            }
        }
    }
    out_ += '"';
    return *this;
}

JsonWriter &JsonWriter::value(bool b) {
    separate();
    out_ += b ? "true" : "false";
    return *this;
}

JsonWriter &JsonWriter::value(long long n) {
    if (safeIntegers_ && (n < -9007199254740991LL || n > 9007199254740991LL))
        throw std::range_error("unsafe_integer");
    separate();
    out_ += std::to_string(n);
    return *this;
}

JsonWriter &JsonWriter::value(unsigned long long n) {
    if (safeIntegers_ && n > 9007199254740991ULL)
        throw std::range_error("unsafe_integer");
    separate();
    out_ += std::to_string(n);
    return *this;
}

namespace {

const char *name(InstKind k) {
    switch (k) {
    case InstKind::Module:
        return "module";
    case InstKind::Interface:
        return "interface";
    case InstKind::Program:
        return "program";
    case InstKind::Blackbox:
        return "blackbox";
    case InstKind::Primitive:
        return "primitive";
    }
    return "module";
}

const char *name(DefKind k) {
    switch (k) {
    case DefKind::Module:
        return "module";
    case DefKind::Interface:
        return "interface";
    case DefKind::Program:
        return "program";
    case DefKind::Blackbox:
        return "blackbox";
    case DefKind::Primitive:
        return "primitive";
    }
    return "module";
}

const char *name(Direction d) {
    switch (d) {
    case Direction::In:
        return "in";
    case Direction::Out:
        return "out";
    case Direction::InOut:
        return "inout";
    case Direction::Ref:
        return "ref";
    case Direction::Unknown:
        return "unknown";
    }
    return "unknown";
}

const char *name(PortKind k) {
    switch (k) {
    case PortKind::Port:
        return "port";
    case PortKind::Interface:
        return "interface";
    case PortKind::Multi:
        return "multi";
    }
    return "port";
}

const char *name(ErrorCode c) {
    switch (c) {
    case ErrorCode::BadRequest:
        return "bad_request";
    case ErrorCode::NotFound:
        return "not_found";
    case ErrorCode::StaleCursor:
        return "stale_cursor";
    case ErrorCode::Unsupported:
        return "unsupported";
    case ErrorCode::Internal:
        return "internal";
    case ErrorCode::Cancelled:
        return "cancelled";
    }
    return "internal";
}

constexpr std::pair<HitKind, std::string_view> hitKinds[] = {
    {HitKind::Definition, "definition"}, {HitKind::Instance, "instance"},
    {HitKind::Port, "port"}, {HitKind::Signal, "signal"},
    {HitKind::Process, "process"}, {HitKind::Register, "register"}};

} // namespace

std::optional<model::HitKind> parseHitKind(std::string_view text) {
    for (const auto &[kind, label] : hitKinds)
        if (label == text)
            return kind;
    return {};
}

void write(JsonWriter &w, const InstInfo &v) {
    w.beginObject();
    w.key("ref").value(v.ref);
    w.key("name").value(v.name);
    w.key("path").beginArray();
    for (auto &s : v.path)
        w.value(s);
    w.endArray();
    w.key("pathText").value(v.pathText);
    w.key("kind").value(name(v.kind));
    w.key("def").value(v.def);
    w.key("defName").value(v.defName);
    w.key("childCount").value(v.childCount);
    w.key("hasParamOverrides").value(v.hasParamOverrides);
    w.endObject();
}

void write(JsonWriter &w, const PortInfo &v) {
    w.beginObject();
    w.key("ref").value(v.ref);
    w.key("internal");
    write(w, v.internal);
    if (!v.attrs.empty()) {
        w.key("attrs").beginObject();
        for (auto &[key, value] : v.attrs)
            w.key(key).value(value);
        w.endObject();
    }
    w.key("name").value(v.name);
    w.key("direction").value(name(v.direction));
    w.key("kind").value(name(v.kind));
    if (v.kind == PortKind::Interface) {
        w.key("interfaceDef").value(v.interfaceDef);
        w.key("modport").value(v.modport);
    } else {
        w.key("type").value(v.typeText);
        w.key("width").value(v.width);
        w.key("signed").value(v.isSigned);
        w.key("members");
        write(w, v.members);
        w.key("dims").beginArray();
        for (auto &d : v.dims) {
            w.beginObject();
            w.key("left").value(int64_t(d.left));
            w.key("right").value(int64_t(d.right));
            w.key("packed").value(d.packed);
            w.endObject();
        }
        w.endArray();
    }
    w.endObject();
}

void write(JsonWriter &w, const ParamInfo &v) {
    w.beginObject();
    w.key("name").value(v.name);
    w.key("value").value(v.value);
    if (!v.isType)
        w.key("type").value(v.typeText);
    w.key("isType").value(v.isType);
    w.key("isLocal").value(v.isLocal);
    w.key("isPort").value(v.isPort);
    w.key("isOverridden").value(v.isOverridden);
    w.endObject();
}

void write(JsonWriter &w, const DefSummary &v) {
    w.beginObject();
    w.key("ref").value(v.ref);
    w.key("name").value(v.name);
    w.key("kind").value(name(v.kind));
    if (!v.file.empty()) {
        w.key("file").value(v.file);
        w.key("line").value(v.line);
    }
    w.endObject();
}

void write(JsonWriter &w, const Diagnostics &v) {
    w.beginObject();
    w.key("errorCount").value(v.errorCount);
    w.key("warningCount").value(v.warningCount);
    w.key("truncated").value(v.truncated);
    w.key("items").beginArray();
    for (auto &d : v.items) {
        w.beginObject();
        w.key("severity").value(d.isError ? "error" : "warning");
        w.key("message").value(d.message);
        if (!d.file.empty()) {
            w.key("file").value(d.file);
            w.key("line").value(d.line);
        }
        w.endObject();
    }
    w.endArray();
    w.endObject();
}

void write(JsonWriter &w, const SnapshotInfo &v) {
    w.beginObject();
    w.key("protocol").value(kProtocolVersion);
    w.key("schemaVersion").value(v.schemaVersion);
    w.key("frontend").beginObject();
    w.key("name").value(v.frontend.name);
    w.key("version").value(v.frontend.version);
    w.endObject();
    w.key("bodySharing").value(v.frontend.sharedBodies ? "fast" : "per-instance");
    if (!v.frontend.sharedBodies)
        w.key("bodySharingReason").value(v.frontend.sharedBodiesReason);
    w.key("tops");
    write(w, v.tops);
    w.key("definitionCount").value(v.definitionCount);
    w.key("bodyCount").value(v.bodyCount);
    w.key("snapshotId").value(v.snapshotId);
    w.key("inputHash").value(v.inputHash);
    w.key("inputHashComplete").value(v.inputHashComplete);
    w.key("indexState").value(v.indexState);
    w.key("openedAt").value(v.openedAt);
    w.key("topCandidates");
    write(w, v.topCandidates);
    w.endObject();
}

void write(JsonWriter &w, const Error &v) {
    w.beginObject().key("error").beginObject();
    w.key("code").value(name(v.code));
    w.key("message").value(v.message);
    w.endObject().endObject();
}

std::string buildInfoJson() {
    const BuildInfo b = buildInfo();
    JsonWriter w;
    w.beginObject();
    w.key("protocol").value(kProtocolVersion);
    w.key("schemaVersion").value(b.schemaVersion);
    w.key("frontend").beginObject();
    w.key("name").value(b.frontendName);
    w.key("version").value(b.frontendVersion);
    w.key("sourceId").value(b.frontendSourceId);
    w.endObject();
    w.key("bodySharing").value(b.sharingBlockedReason.empty() ? "fast" : "per-instance");
    if (!b.sharingBlockedReason.empty())
        w.key("bodySharingReason").value(b.sharingBlockedReason);
    w.endObject();
    return w.str();
}

void attrs(JsonWriter &w, const std::map<std::string, std::string> &values) {
    w.beginObject();
    for (auto &[key, value] : values)
        w.key(key).value(value);
    w.endObject();
}
void write(JsonWriter &w, const PinInfo &v) {
    w.beginObject().key("name").value(v.name).key("direction").value(name(v.dir)).key("width");
    if (v.width)
        w.value(*v.width);
    else
        w.null();
    w.key("attrs");
    attrs(w, v.attrs);
    w.endObject();
}
void write(JsonWriter &w, const CellInfo &v) {
    w.beginObject().key("pins");
    write(w, v.pins);
    w.key("attrs");
    attrs(w, v.attrs);
    w.endObject();
}
JsonWriter &JsonWriter::null() {
    separate();
    out_ += "null";
    return *this;
}
void write(JsonWriter &w, const MemberInfo &v) {
    w.beginObject().key("name").value(v.name).key("type").value(v.typeText).key("bits");
    write(w, v.bits);
    w.key("signed").value(v.isSigned);
    w.key("dims").beginArray();
    for (auto &d : v.dims)
        w.beginObject()
            .key("left")
            .value(d.left)
            .key("right")
            .value(d.right)
            .key("packed")
            .value(d.packed)
            .endObject();
    w.endArray();
    w.key("members");
    write(w, v.members);
    w.endObject();
}
void write(JsonWriter &w, const BitRange &v) {
    w.beginObject();
    w.key("lsb").value(v.lsb);
    w.key("width").value(v.width);
    w.endObject();
}
void write(JsonWriter &w, const Slice &v) {
    w.beginObject();
    w.key("ref").value(v.ref);
    w.key("bits");
    write(w, v.bits);
    w.endObject();
}
void write(JsonWriter &w, const Reason &v) {
    w.beginObject();
    w.key("code").value(v.code);
    if (!v.at.empty())
        w.key("at").value(v.at);
    if (!v.detail.empty())
        w.key("detail").value(v.detail);
    w.endObject();
}
void write(JsonWriter &w, const Completeness &v) {
    w.beginObject();
    w.key("status").value(v.status);
    w.key("reasons");
    write(w, v.reasons);
    w.endObject();
}
void write(JsonWriter &w, const Dep &v) {
    w.beginObject();
    w.key("signal").value(v.signal);
    w.key("bits");
    write(w, v.bits);
    w.key("role").value(v.role);
    w.key("precision").value(v.precision);
    w.key("align").value(v.align);
    w.endObject();
}
void write(JsonWriter &w, const Write &v) {
    w.beginObject();
    w.key("target");
    write(w, v.target);
    w.key("deps");
    write(w, v.deps);
    if (v.exprMap) {
        w.key("exprMap");
        write(w, *v.exprMap);
    }
    w.endObject();
}
void write(JsonWriter &w, const ExprMapping &v) {
    w.beginObject().key("status").value(v.status);
    if (v.status == "mapped") {
        w.key("segments");
        write(w, v.segments);
    } else
        w.key("reason").value(v.reason);
    w.endObject();
}
void write(JsonWriter &w, const BindTarget &v) {
    w.beginObject();
    w.key("kind").value(v.kind);
    if (!v.signal.empty())
        w.key("signal").value(v.signal);
    if (!v.value.empty())
        w.key("value").value(v.value);
    if (!v.process.empty())
        w.key("process").value(v.process);
    if (!v.reason.empty())
        w.key("reason").value(v.reason);
    if (v.kind == "signal") {
        w.key("bits");
        write(w, v.bits);
    }
    w.endObject();
}
void write(JsonWriter &w, const BindSegment &v) {
    w.beginObject();
    w.key("pinBits");
    write(w, v.pinBits);
    w.key("target");
    write(w, v.target);
    w.endObject();
}
void write(JsonWriter &w, const PortInternal &v) {
    w.beginObject();
    w.key("kind").value(v.kind);
    if (!v.signal.empty())
        w.key("signal").value(v.signal);
    if (!v.reason.empty())
        w.key("reason").value(v.reason);
    if (!v.expr.empty())
        w.key("expr").value(v.expr);
    if (v.kind == "direct") {
        w.key("bits");
        write(w, v.bits);
    }
    if (v.kind == "mapped") {
        w.key("status").value(v.status);
        w.key("segments").beginArray();
        for (auto &s : v.segments) {
            w.beginObject().key("portBits");
            write(w, s.pinBits);
            w.key("target");
            write(w, s.target);
            w.endObject();
        }
        w.endArray();
    }
    w.endObject();
}
void write(JsonWriter &w, const PinBinding &v) {
    w.beginObject();
    w.key("inst").value(v.inst);
    w.key("pin").value(v.pin);
    w.key("port").value(v.port);
    w.key("direction").value(v.direction);
    w.key("segments");
    write(w, v.segments);
    if (!v.unresolved.empty())
        w.key("unresolved").value(v.unresolved);
    w.key("width");
    if (v.width)
        w.value(*v.width);
    else
        w.null();
    w.endObject();
}
void write(JsonWriter &w, const LocalNetlist &v) {
    w.beginObject();
    w.key("inst").value(v.inst);
    w.key("bindings");
    write(w, v.bindings);
    w.endObject();
}
void write(JsonWriter &w, const SignalInfo &v) {
    w.beginObject();
    w.key("ref").value(v.ref);
    w.key("name").value(v.name);
    w.key("kind").value(v.kind);
    w.key("width").value(v.width);
    w.key("type").value(v.typeText);
    w.key("signed").value(v.isSigned);
    w.key("members");
    write(w, v.members);
    w.key("opaque").value(v.opaque);
    w.key("dims").beginArray();
    for (auto &d : v.dims) {
        w.beginObject()
            .key("left")
            .value(d.left)
            .key("right")
            .value(d.right)
            .key("packed")
            .value(d.packed)
            .endObject();
    }
    w.endArray();
    w.endObject();
}
void write(JsonWriter &w, const ExternalRef &v) {
    w.beginObject();
    w.key("text").value(v.text);
    w.key("access").value(v.access);
    w.endObject();
}
void write(JsonWriter &w, const Expr &v) {
    w.beginObject().key("op").value(v.op);
    w.key("width");
    if (v.width)
        w.value(*v.width);
    else
        w.null();
    w.key("signed").value(v.isSigned);
    if (v.op == "ref") {
        w.key("slice");
        write(w, v.slice);
    } else if (v.op == "const")
        w.key("value").value(v.value);
    else if (v.op == "other") {
        w.key("text").value(v.text);
        w.key("uses");
        write(w, v.uses);
    } else {
        w.key("args");
        write(w, v.args);
    }
    w.endObject();
}
void write(JsonWriter &w, const ProcessSummary &v) {
    w.beginObject();
    w.key("ref").value(v.ref);
    w.key("kind").value(v.kind);
    w.endObject();
}
void write(JsonWriter &w, const ProcessInfo &v) {
    w.beginObject();
    w.key("ref").value(v.ref);
    w.key("kind").value(v.kind);
    w.key("inst").value(v.inst);
    w.key("writes");
    write(w, v.writes);
    w.key("externalRefs");
    write(w, v.externalRefs);
    if (v.expr) {
        w.key("expr");
        write(w, *v.expr);
    }
    w.endObject();
}
void write(JsonWriter &w, const EventInfo &v) {
    w.beginObject();
    w.key("signal").value(v.signal);
    w.key("bits");
    write(w, v.bits);
    w.key("edge").value(v.edge);
    if (!v.type.empty())
        w.key("type").value(v.type);
    w.endObject();
}
void write(JsonWriter &w, const RegisterInfo &v) {
    w.beginObject();
    w.key("ref").value(v.ref);
    w.key("inst").value(v.inst);
    w.key("signal").value(v.signal);
    w.key("bits");
    write(w, v.bits);
    w.key("process").value(v.process);
    // ClockEvent has no asynchronous classification. EventInfo is shared by
    // Core with async events, whose type must still be serialized below.
    w.key("clock").beginObject().key("signal").value(v.clock.signal).key("bits");
    write(w, v.clock.bits);
    w.key("edge").value(v.clock.edge).endObject();
    w.key("async");
    write(w, v.async);
    w.endObject();
}
void write(JsonWriter &w, const ObjectInfo &v) {
    w.beginObject();
    w.key("ref").value(v.ref);
    w.key("kind").value(v.kind);
    w.key("name").value(v.name);
    w.key("inst").value(v.inst);
    w.key("pathText").value(v.pathText);
    w.endObject();
}
void write(JsonWriter &w, const BitMapSegment &v) {
    w.beginObject();
    w.key("from").value(v.from);
    w.key("to").value(v.to);
    w.key("width").value(v.width);
    w.endObject();
}
void write(JsonWriter &w, const Continuation &v) {
    w.beginObject();
    w.key("from");
    write(w, v.from);
    w.key("slice");
    write(w, v.slice);
    w.key("role").value(v.role);
    w.key("precision").value(v.precision);
    w.key("align").value(v.align);
    w.key("map");
    write(w, v.map);
    if (v.side)
        w.key("side").value(*v.side);
    w.endObject();
}
void write(JsonWriter &w, const TracePoint &v) {
    w.beginObject().key("slice");
    write(w, v.slice);
    if (v.side)
        w.key("side").value(*v.side);
    w.endObject();
}
void write(JsonWriter &w, const std::string &v) { w.value(v); }
void write(JsonWriter &w, const ObjectHit &v) {
    std::string_view label = "unknown";
    for (const auto &[kind, text] : hitKinds)
        if (v.kind == kind)
            label = text;
    w.beginObject();
    w.key("kind").value(label);
    w.key("ref").value(v.ref);
    w.key("name").value(v.name);
    w.key("path");
    write(w, v.path);
    w.key("pathText").value(v.pathText);
    if (v.inst)
        w.key("inst").value(*v.inst);
    if (v.def)
        w.key("def").value(*v.def);
    w.endObject();
}
// Endpoint.via retains the M2 route representation. Only step publishes the
// expanded M3 fact / continuation contract; do not serialize its empty defaults
// as invented facts on an existing endpoint route.
static void writeHop(JsonWriter &w, const Hop &v, bool step) {
    w.beginObject();
    w.key("kind").value(v.kind);
    if (step)
        w.key("fact").value(v.fact);
    if (v.at) {
        w.key("at");
        write(w, *v.at);
    }
    if (v.value)
        w.key("value").value(*v.value);
    if (!v.via.empty())
        w.key("via").value(v.via);
    if (!v.reason.empty())
        w.key("reason").value(v.reason);
    w.key("from");
    write(w, v.from);
    w.key("map");
    write(w, v.map);
    w.key("next");
    if (step)
        write(w, v.next);
    else {
        w.beginArray();
        for (const auto &next : v.next) {
            w.beginObject().key("slice");
            write(w, next.slice);
            w.key("role").value(next.role);
            w.key("precision").value(next.precision);
            w.endObject();
        }
        w.endArray();
    }
    if (v.cell) {
        w.key("cell");
        write(w, *v.cell);
    }
    w.endObject();
}
void write(JsonWriter &w, const Hop &v) { writeHop(w, v, true); }
void write(JsonWriter &w, const Endpoint &v) {
    w.beginObject();
    w.key("kind").value(v.kind);
    w.key("queried");
    write(w, v.queried);
    if (!v.ref.empty())
        w.key("ref").value(v.ref);
    if (!v.inst.empty())
        w.key("inst").value(v.inst);
    if (!v.value.empty())
        w.key("value").value(v.value);
    if (!v.reason.empty())
        w.key("reason").value(v.reason);
    w.key("via");
    w.beginArray();
    for (const auto &hop : v.via)
        writeHop(w, hop, false);
    w.endArray();
    if (v.bits) {
        w.key("bits");
        write(w, *v.bits);
    }
    if (v.at) {
        w.key("at");
        write(w, *v.at);
    }
    w.endObject();
}
void write(JsonWriter &w, const StepResult &v) {
    w.beginObject();
    w.key("hops");
    write(w, v.hops);
    if (!v.next.empty())
        w.key("next").value(v.next);
    w.key("hasConservative").value(v.hasConservative);
    w.endObject();
}

void write(JsonWriter &w, const TraceNode &v) {
    w.beginObject().key("id").value(v.id).key("kind").value(v.kind);
    if (v.point) {
        w.key("point");
        write(w, *v.point);
    }
    if (v.ref)
        w.key("ref").value(*v.ref);
    if (v.fact)
        w.key("fact").value(*v.fact);
    if (v.value)
        w.key("value").value(*v.value);
    if (v.reason)
        w.key("reason").value(*v.reason);
    w.endObject();
}
void write(JsonWriter &w, const TraceEdge &v) {
    w.beginObject().key("id").value(v.id).key("fact").value(v.fact)
        .key("from").value(v.from).key("to").value(v.to).key("kind").value(v.kind)
        .key("role").value(v.role).key("precision").value(v.precision).key("align").value(v.align);
    if (v.via)
        w.key("via").value(*v.via);
    if (v.fromBits) {
        w.key("fromBits");
        write(w, *v.fromBits);
    }
    if (v.toBits) {
        w.key("toBits");
        write(w, *v.toBits);
    }
    w.key("map");
    write(w, v.map);
    w.endObject();
}
void write(JsonWriter &w, const TraceFrontier &v) {
    w.beginObject().key("point");
    write(w, v.point);
    w.key("depth").value(v.depth).key("reason").value(v.reason);
    if (v.stepCursor)
        w.key("stepCursor").value(*v.stepCursor);
    w.endObject();
}
void write(JsonWriter &w, const TraceResult &v) {
    w.beginObject().key("nodes");
    write(w, v.nodes);
    w.key("edges");
    write(w, v.edges);
    w.key("frontier");
    write(w, v.frontier);
    w.key("hasConservative").value(v.hasConservative);
    w.endObject();
}
namespace {
constexpr std::string_view sourceKinds[] = {"definition", "instantiation", "statement"};
}
std::optional<SourceKind> parseSourceKind(std::string_view text) {
    for (size_t i = 0; i < std::size(sourceKinds); ++i)
        if (sourceKinds[i] == text)
            return SourceKind(i);
    return {};
}
void write(JsonWriter &w, const SourcePos &v) {
    w.beginObject().key("offset").value(v.offset).key("line").value(v.line)
        .key("column").value(v.column).endObject();
}
void write(JsonWriter &w, const SourceSpan &v) {
    w.beginObject().key("file").value(v.file).key("path").value(v.path).key("start");
    write(w, v.start);
    w.key("end");
    write(w, v.end);
    w.key("contentHash").value(v.contentHash).endObject();
}
void write(JsonWriter &w, const SourceHit &v) {
    // Validate before writing so invalid C++ input cannot publish a partial hit.
    std::string_view refKind;
    if (v.refKind) {
        switch (*v.refKind) {
        case SourceRefKind::Definition: refKind = "definition"; break;
        case SourceRefKind::Object: refKind = "object"; break;
        default: throw std::invalid_argument("Invalid SourceRefKind");
        }
    }
    w.beginObject().key("ref").value(v.ref).key("kind").value(sourceKinds[size_t(v.kind)])
        .key("span");
    write(w, v.span);
    if (v.inst)
        w.key("inst").value(*v.inst);
    if (v.refKind)
        w.key("refKind").value(refKind);
    w.endObject();
}
void write(JsonWriter &w, const SourceRead &v) {
    w.beginObject().key("text").value(v.text).key("contentHash").value(v.contentHash)
        .key("matchesSnapshot").value(v.matchesSnapshot).endObject();
}
void write(JsonWriter &w, const InputCheck &v) {
    w.beginObject().key("changed");
    write(w, v.changed);
    w.key("complete").value(v.complete).endObject();
}
} // namespace hier::protocol
