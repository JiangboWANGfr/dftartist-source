#include "document.h"

#include "json/JsonValue.h"  // header-only parser shared from hdl-core

namespace genconn {

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

BusInterface parseIface(const Value& v) {
    BusInterface bi;
    bi.id = reqStr(v, "id");
    bi.busType = reqStr(v, "busType");
    bi.role = reqStr(v, "role");
    bi.interfaceName = optStr(v, "interfaceName");
    bi.powerDomain = optStr(v, "powerDomain");
    bi.pdMatchOnly = optBool(v, "pdMatchOnly");
    bi.busWidth = optInt(v, "busWidth");
    bi.bscanVariant = optStr(v, "bscanVariant");
    bi.omitMemCtrl = optBool(v, "omitMemCtrl");
    bi.ifNamePlacement = optStr(v, "ifNamePlacement");
    const Value* pf = v.find("portedFrom");
    if (pf && pf->type == Value::Type::Object) {
        PortedFrom p;
        p.instanceId = reqStr(*pf, "instanceId");
        p.interfaceId = reqStr(*pf, "interfaceId");
        bi.portedFrom = p;
    }
    bi.placement = optStr(v, "placement");
    bi.isDataSource = optBool(v, "isDataSource");
    return bi;
}

HardenInstance parseInst(const Value& v) {
    HardenInstance hi;
    hi.id = reqStr(v, "id");
    hi.instanceName = reqStr(v, "instanceName");
    hi.hardenId = reqStr(v, "hardenId");
    const Value* pd = v.find("ifacePd");
    if (pd && pd->type == Value::Type::Object)
        for (const auto& [k, val] : pd->obj)
            if (val.type == Value::Type::Str) hi.ifacePd[k] = val.s;
    return hi;
}

BusConnection parseConn(const Value& v) {
    BusConnection c;
    c.id = reqStr(v, "id");
    c.secondaryInstanceId = reqStr(v, "secondaryInstanceId");
    c.secondaryInterfaceId = reqStr(v, "secondaryInterfaceId");
    c.clientInstanceId = reqStr(v, "clientInstanceId");
    c.clientInterfaceId = reqStr(v, "clientInterfaceId");
    return c;
}

HardenDef parseDef(const Value& v) {
    HardenDef d;
    d.id = reqStr(v, "id");
    d.designName = reqStr(v, "designName");
    d.designLevel = reqStr(v, "designLevel");
    d.designType = reqStr(v, "designType");
    d.fileName = optStr(v, "fileName");
    if (const Value* a = v.find("interfaces"))
        for (const auto& e : a->arr) d.interfaces.push_back(parseIface(e));
    if (const Value* a = v.find("childInstances"))
        for (const auto& e : a->arr) d.childInstances.push_back(parseInst(e));
    if (const Value* a = v.find("connections"))
        for (const auto& e : a->arr) d.connections.push_back(parseConn(e));
    return d;
}

}  // namespace

GenConnDocument parseDocument(const std::string& jsonText) {
    Value root = hdl::json::parse(jsonText);
    GenConnDocument doc;
    doc.schemaVersion = optInt(root, "schemaVersion").value_or(1);
    if (const Value* lib = root.find("library")) {
        if (const Value* defs = lib->find("defs"))
            for (const auto& e : defs->arr) doc.library.defs.push_back(parseDef(e));
    }
    if (const Value* ui = root.find("ui")) {
        doc.openDefId = ui->str("openDefId");
        doc.rootDefId = ui->str("rootDefId");
    }
    return doc;
}

}  // namespace genconn
