#include "Dispatch.h"
#include "SchemaPrimitives.h"
#include "WireSchema.h"
#include "hier/protocol/Json.h"

#include <stdexcept>

namespace hier::protocol::session {
namespace {
using Object = JsonValue::Object;

const std::string &text(const Object &o, std::string_view key) {
    return std::get<std::string>(o.find(key)->second.value);
}
const Object &object(const Object &o, std::string_view key) {
    return std::get<Object>(o.find(key)->second.value);
}
int64_t number(const Object &o, std::string_view key) {
    return *schema::integer(o.find(key)->second);
}
bool boolean(const Object &o, std::string_view key) {
    return std::get<bool>(o.find(key)->second.value);
}
PageRequest page(const Object &o) {
    return {text(o, "cursor"), static_cast<int>(number(o, "limit"))};
}
model::BitRange bits(const Object &o) {
    return {static_cast<uint64_t>(number(o, "lsb")), static_cast<uint64_t>(number(o, "width"))};
}
ConnectionRequest connection(const Object &o, std::string_view field) {
    ConnectionRequest request;
    const auto &slice = object(o, field);
    if (slice.contains("bits"))
        request.bits = bits(object(slice, "bits"));
    if (o.contains("side"))
        request.side = text(o, "side");
    if (o.contains("reach"))
        request.reach = text(o, "reach");
    return request;
}
model::TracePoint point(const Object &o) {
    const auto &slice = object(o, "slice");
    return {{text(slice, "ref"), bits(object(slice, "bits"))},
            o.contains("side") ? std::optional(text(o, "side")) : std::nullopt};
}
model::Budget budget(const Object &o) {
    model::Budget result;
    if (!o.contains("budget"))
        return result;
    const auto &b = object(o, "budget");
    result.maxNodes = number(b, "maxNodes");
    result.maxEdges = number(b, "maxEdges");
    result.maxDepth = number(b, "maxDepth");
    if (b.contains("maxMillis"))
        result.maxMillis = number(b, "maxMillis");
    return result;
}
template <class T> void success(JsonWriter &w, const T &value) {
    w.key("result");
    write(w, value);
    w.key("completeness");
    write(w, model::Completeness{});
}
template <class T> void success(JsonWriter &w, const model::QueryResult<T> &value) {
    w.key("result");
    write(w, value.result);
    w.key("completeness");
    write(w, value.completeness);
}
template <class T> ReplyFrame reply(uint64_t id, const T &value) {
    JsonWriter w(true);
    w.beginObject().key("id").value(id).key("ok").value(true);
    success(w, value);
    w.endObject();
    return {w.str()};
}
template <class T> ReplyFrame reply(uint64_t id, const Result<T> &value) {
    return value ? reply(id, *value) : errorReply(id, value.error());
}
} // namespace

ReplyFrame errorReply(uint64_t id, std::string_view code, std::string_view message,
                      const std::map<std::string, std::string> &data) {
    JsonWriter w(true);
    w.beginObject().key("id").value(id).key("ok").value(false).key("error").beginObject();
    w.key("code").value(code).key("message").value(message).key("data").beginObject();
    for (const auto &[key, value] : data)
        w.key(key).value(value);
    w.endObject().endObject().endObject();
    return {w.str()};
}
ReplyFrame errorReply(uint64_t id, const Error &error) {
    // Reuse the existing Core error serializer's code mapping at this boundary.
    JsonWriter w;
    write(w, error);
    auto parsed = std::get<Object>(decodeFrame(w.str()));
    const auto &value = object(parsed, "error");
    return errorReply(id, text(value, "code"), error.message);
}

ReplyFrame execute(Design &design, const Request &request, Cancel cancel) {
    const auto id = request.id;
    if (cancel.stop_requested())
        return errorReply(id, Error{ErrorCode::Cancelled, "query cancelled"});
    const auto method = findMethod(request.method);
    if (!method)
        return errorReply(id, "unknown_method", "unknown method");
    const JsonValue input{request.params};
    if (!validateDefinition(method->params, input))
        return errorReply(id, "bad_request", "invalid method params");
    const auto normalized = method->normalize(input);
    const auto &p = std::get<Object>(normalized.value);
    const auto &m = request.method;
    try {
        if (m == "design.info")
            return reply(id, design.snapshot(cancel));
        if (m == "design.diagnostics")
            return reply(id,
                         design.diagnostics(static_cast<size_t>(number(p, "maxItems")), cancel));
        if (m == "design.checkInputs")
            return reply(id, design.checkInputs(cancel));
        if (m == "inst.roots")
            return reply(id, design.roots(cancel));
        if (m == "inst.children")
            return reply(id, design.children(text(p, "inst"), page(p), cancel));
        if (m == "inst.ancestors")
            return reply(id, design.ancestors(text(p, "inst"), cancel));
        if (m == "inst.get")
            return reply(id, design.instance(text(p, "inst"), cancel));
        if (m == "inst.ports")
            return reply(id, design.ports(text(p, "inst"), cancel));
        if (m == "inst.params")
            return reply(id, design.params(text(p, "inst"), cancel));
        if (m == "inst.signals") {
            const auto filter =
                p.contains("filter") ? text(object(p, "filter"), "text") : std::string{};
            return reply(id, design.signals(text(p, "inst"), page(p), filter, cancel));
        }
        if (m == "def.list")
            return reply(id, design.definitions(page(p), cancel));
        if (m == "def.instances")
            return reply(id, design.instancesOf(text(p, "def"), page(p), cancel));
        if (m == "search") {
            model::SearchQuery query;
            query.text = text(p, "text");
            if (p.contains("scope"))
                query.scope = text(p, "scope");
            if (p.contains("kinds")) {
                query.kinds.emplace();
                for (const auto &kind : std::get<JsonValue::Array>(p.at("kinds").value))
                    query.kinds->push_back(*parseHitKind(std::get<std::string>(kind.value)));
            }
            return reply(id, design.search(query, page(p), cancel));
        }
        if (m == "path.resolve")
            return reply(id, design.resolvePath(text(p, "text"), cancel));
        if (m == "conn.bindings")
            return reply(id, design.bindings(text(p, "inst"), cancel));
        if (m == "conn.drivers")
            return reply(id, design.drivers(text(object(p, "slice"), "ref"), connection(p, "slice"),
                                            cancel));
        if (m == "conn.loads")
            return reply(
                id, design.loads(text(object(p, "slice"), "ref"), connection(p, "slice"), cancel));
        if (m == "conn.step")
            return reply(id,
                         design.step(text(object(p, "from"), "ref"), text(p, "direction") == "back",
                                     connection(p, "from"),
                                     {static_cast<int>(number(p, "maxHops")), text(p, "cursor")},
                                     cancel));
        if (m == "trace.cone") {
            const auto &policy = text(p, "policy");
            return reply(
                id, design.cone(point(object(p, "start")),
                                text(p, "direction") == "back" ? model::TraceDirection::Back
                                                               : model::TraceDirection::Forward,
                                policy == "structural"      ? model::TracePolicy::Structural
                                : policy == "combinational" ? model::TracePolicy::Combinational
                                                            : model::TracePolicy::Full,
                                budget(p), cancel));
        }
        if (m == "trace.paths")
            return reply(id, design.paths(point(object(p, "from")), point(object(p, "to")),
                                          budget(p), cancel));
        if (m == "seq.registers")
            return reply(
                id, design.registers(text(p, "inst"), page(p), boolean(p, "recursive"), cancel));
        if (m == "proc.list")
            return reply(id, design.procs(text(p, "inst"), page(p), cancel));
        if (m == "proc.get")
            return reply(id, design.proc(text(p, "ref"), cancel));
        if (m == "obj.get")
            return reply(id, design.object(text(p, "ref"), cancel));
        if (m == "obj.source")
            return reply(id,
                         design.source(text(p, "ref"), *parseSourceKind(text(p, "kind")), cancel));
        if (m == "source.resolve")
            return reply(
                id, design.resolveSource(text(p, "file"), static_cast<size_t>(number(p, "line")),
                                         p.contains("col")
                                             ? std::optional(static_cast<size_t>(number(p, "col")))
                                             : std::nullopt,
                                         page(p), cancel));
        if (m == "source.read")
            return reply(id, design.readSource(text(p, "file"), cancel));
        return errorReply(id, "internal", "registered method has no dispatcher");
    } catch (const std::range_error &e) {
        if (std::string_view(e.what()) != "unsafe_integer")
            throw;
        return errorReply(id, "unsupported", "result cannot be represented by wire integers",
                          {{"reason", "unsafe_integer"}});
    }
}
} // namespace hier::protocol::session
