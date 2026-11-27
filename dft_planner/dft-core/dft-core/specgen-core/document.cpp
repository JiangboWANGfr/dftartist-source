#include "document.h"

#include "json/JsonValue.h"  // header-only parser shared from hdl-core

namespace specgen {

namespace {
using hdl::json::Value;

std::optional<std::string> optStr(const Value& v, const std::string& k) {
    const Value* f = v.find(k);
    if (f && f->type == Value::Type::Str) return f->s;
    return std::nullopt;
}
std::optional<int> optInt(const Value& v, const std::string& k) {
    const Value* f = v.find(k);
    if (f && f->type == Value::Type::Int) return static_cast<int>(f->i);
    return std::nullopt;
}
std::optional<bool> optBool(const Value& v, const std::string& k) {
    const Value* f = v.find(k);
    if (f && f->type == Value::Type::Bool) return f->b;
    return std::nullopt;
}
std::string reqStr(const Value& v, const std::string& k) { return v.str(k); }

// Same field set/style as genconn-core/document.cpp parseIface (SpecGen only needs
// the fields expandInterface reads).
genconn::BusInterface parseIface(const Value& v) {
    genconn::BusInterface bi;
    bi.id = reqStr(v, "id");
    bi.busType = reqStr(v, "busType");
    bi.role = reqStr(v, "role");
    bi.interfaceName = optStr(v, "interfaceName");
    bi.powerDomain = optStr(v, "powerDomain");
    bi.pdMatchOnly = optBool(v, "pdMatchOnly");
    bi.busWidth = optInt(v, "busWidth");
    bi.bscanVariant = optStr(v, "bscanVariant");
    bi.ifNamePlacement = optStr(v, "ifNamePlacement");
    bi.isDataSource = optBool(v, "isDataSource");
    bi.placement = optStr(v, "placement");  // "pin" | "other"：1838jtag secondary=other → host（否则 sec_host）
    return bi;
}

DftEndpoint parseEndpoint(const Value& v) {
    DftEndpoint ep;
    if (v.find("ipId")) {
        ep.kind = "ip";
        ep.ipId = reqStr(v, "ipId");
        ep.port = reqStr(v, "port");
    } else {
        ep.kind = "iface";
        ep.instanceId = reqStr(v, "instanceId");
        ep.interfaceId = reqStr(v, "interfaceId");
        ep.pin = reqStr(v, "pin");
    }
    return ep;
}

DftIpInstance parseDftIp(const Value& v) {
    DftIpInstance ip;
    ip.id = reqStr(v, "id");
    ip.ipType = reqStr(v, "ipType");
    ip.instanceName = reqStr(v, "instanceName");
    const Value* cfg = v.find("config");
    if (cfg) ip.config = *cfg;
    else ip.config.type = Value::Type::Object;
    ip.moduleName = optStr(v, "moduleName");
    return ip;
}

DftWire parseDftWire(const Value& v) {
    DftWire w;
    w.id = reqStr(v, "id");
    if (const Value* f = v.find("from")) w.from = parseEndpoint(*f);
    if (const Value* t = v.find("to")) w.to = parseEndpoint(*t);
    return w;
}

SpecgenScope parseDef(const Value& v) {
    SpecgenScope s;
    s.id = v.str("id");
    s.designName = reqStr(v, "designName");
    if (const Value* a = v.find("interfaces"))
        for (const auto& e : a->arr) s.interfaces.push_back(parseIface(e));
    if (const Value* a = v.find("dftIps"))
        for (const auto& e : a->arr) s.dftIps.push_back(parseDftIp(e));
    if (const Value* a = v.find("dftWires"))
        for (const auto& e : a->arr) s.dftWires.push_back(parseDftWire(e));
    return s;
}

}  // namespace

SpecgenScope parseScope(const std::string& jsonText) {
    Value root = hdl::json::parse(jsonText);
    std::string rootDefId;
    if (const Value* ui = root.find("ui")) rootDefId = ui->str("rootDefId");

    const Value* defs = nullptr;
    if (const Value* lib = root.find("library")) defs = lib->find("defs");
    if (!defs || defs->arr.empty()) return SpecgenScope{};

    const Value* chosen = &defs->arr.front();  // fallback: first def
    for (const auto& d : defs->arr)
        if (d.str("id") == rootDefId) { chosen = &d; break; }
    return parseDef(*chosen);
}

}  // namespace specgen
