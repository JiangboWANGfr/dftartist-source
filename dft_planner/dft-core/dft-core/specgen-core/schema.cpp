#include "schema.h"

#include <map>
#include <stdexcept>

#include "json/JsonValue.h"
#include "schema_embedded.h"  // generated: DATAPATH_SCHEMA_JSON

namespace specgen {

namespace {
using hdl::json::Value;

BlockSchema parseBlock(const Value& v) {
    BlockSchema b;
    const Value* nm = v.find("name");
    if (nm && nm->type == Value::Type::Str) b.name = nm->s;
    const Value* id = v.find("id");
    b.hasId = (id && id->type != Value::Type::Null);
    if (const Value* props = v.find("props"))
        for (const auto& p : props->arr) {
            const Value* pn = p.find("name");
            if (pn && pn->type == Value::Type::Str) b.props.push_back(PropSchema{pn->s});
        }
    if (const Value* blks = v.find("blocks"))
        for (const auto& e : blks->arr) b.blocks.push_back(parseBlock(e));
    return b;
}

const std::map<std::string, BlockSchema>& components() {
    static const std::map<std::string, BlockSchema> m = [] {
        std::map<std::string, BlockSchema> out;
        Value root = hdl::json::parse(std::string(DATAPATH_SCHEMA_JSON));
        if (const Value* comps = root.find("components"))
            for (const auto& [k, v] : comps->obj) out.emplace(k, parseBlock(v));
        return out;
    }();
    return m;
}

const std::map<std::string, BlockSchema>& bscanComponents() {
    static const std::map<std::string, BlockSchema> m = [] {
        std::map<std::string, BlockSchema> out;
        Value root = hdl::json::parse(std::string(BSCAN_SCHEMA_JSON));
        if (const Value* comps = root.find("components"))
            for (const auto& [k, v] : comps->obj) out.emplace(k, parseBlock(v));
        return out;
    }();
    return m;
}

}  // namespace

const BlockSchema& componentSchema(const std::string& ipType) {
    const auto& m = components();
    auto it = m.find(ipType);
    if (it == m.end()) throw std::runtime_error("no datapath schema for " + ipType);
    return it->second;
}

const BlockSchema& bscanComponentSchema(const std::string& name) {
    const auto& m = bscanComponents();
    auto it = m.find(name);
    if (it == m.end()) throw std::runtime_error("no bscan schema for " + name);
    return it->second;
}

}  // namespace specgen
