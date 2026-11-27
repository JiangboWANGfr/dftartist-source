#include "gen.h"

#include <cctype>

namespace specgen {

namespace {
using hdl::json::Value;

// JS `str.trim()` truthiness: true iff str has a non-whitespace char.
bool hasNonSpace(const std::string& s) {
    for (unsigned char c : s)
        if (!std::isspace(c)) return true;
    return false;
}

// JS `name.padEnd(28)`: right-pad with spaces to width 28 (no truncation).
std::string pad28(const std::string& name) {
    if (name.size() >= 28) return name;
    return name + std::string(28 - name.size(), ' ');
}
}  // namespace

std::string ind(int n) {
    std::string out;
    for (int k = 0; k < n; ++k) out += "  ";
    return out;
}

std::string genBlock(const BlockSchema& bs, const Value& data, int depth) {
    std::string out;
    // props (schema order). Value::find self-guards non-objects (returns nullptr).
    for (const auto& p : bs.props) {
        const Value* v = data.find(p.name);
        if (v && v->type == Value::Type::Str && hasNonSpace(v->s))
            out += ind(depth) + pad28(p.name) + ": " + v->s + ";\n";
    }
    // blocks (schema order).
    for (const auto& b : bs.blocks) {
        const std::string& name = *b.name;
        if (b.hasId) {
            const Value* arr = data.find(name);
            if (!arr || arr->type != Value::Type::Array) continue;
            for (const auto& item : arr->arr) {
                const Value* idv = item.find("id");
                std::string id = (idv && idv->type == Value::Type::Str) ? idv->s : "";
                std::string idStr = id.empty() ? "" : "(" + id + ")";
                std::string inner = genBlock(b, item, depth + 1);
                if (idStr.empty() && !hasNonSpace(inner)) continue;
                out += ind(depth) + name + (idStr.empty() ? "" : " " + idStr) +
                       " {\n" + inner + ind(depth) + "}\n";
            }
        } else {
            const Value* bd = data.find(name);
            if (!bd || bd->type != Value::Type::Object) continue;
            std::string inner = genBlock(b, *bd, depth + 1);
            if (!hasNonSpace(inner)) continue;
            out += ind(depth) + name + " {\n" + inner + ind(depth) + "}\n";
        }
    }
    return out;
}

std::string generateFragment(const std::string& ipType, const std::string& instanceName,
                             const Value& config) {
    const BlockSchema& comp = componentSchema(ipType);  // throws if unknown ipType
    std::string compName = comp.name.value_or(ipType);
    return compName + " (" + instanceName + ") {\n" + genBlock(comp, config, 1) + "}\n";
}

}  // namespace specgen
