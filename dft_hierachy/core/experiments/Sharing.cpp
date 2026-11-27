// V1: are two instances that slang considers to have the same canonical body really
// identical in content? Differential test: fingerprint EVERY instance's own body
// independently, then check that instances grouped by slang's canonical body have
// byte-identical fingerprints.
//
// The fingerprint is slang's own AST serialization of every non-instance member of
// the body (declarations, assigns, procedural blocks, expressions, source text is
// excluded), plus for each child instance its name, definition, parameter values and
// port connection expressions. Child bodies are NOT included: they are compared as
// instances in their own right.
#include <cstdio>
#include <map>
#include <unordered_map>

#include <slang/ast/ASTSerializer.h>
#include <slang/ast/InstanceCacheKey.h>
#include <slang/ast/symbols/BlockSymbols.h>
#include <slang/ast/symbols/ParameterSymbols.h>
#include <slang/ast/symbols/PortSymbols.h>
#include <slang/ast/types/Type.h>
#include <slang/text/Json.h>

#include <slang/ast/symbols/CompilationUnitSymbols.h>

#include "Common.h"

using namespace slang;
using namespace slang::ast;

namespace hexp {

namespace {

void fingerprintScope(const Scope& scope, ASTSerializer& ser, JsonWriter& w) {
    for (auto& m : scope.members()) {
        switch (m.kind) {
            case SymbolKind::Instance: {
                auto& inst = m.as<InstanceSymbol>();
                w.startObject();
                w.writeProperty("inst");
                w.writeValue(inst.name);
                w.writeProperty("def");
                w.writeValue(inst.getDefinition().name);
                w.writeProperty("params");
                w.startArray();
                for (auto p : inst.body.getParameters()) {
                    if (p->symbol.kind == SymbolKind::Parameter)
                        w.writeValue(p->symbol.as<ParameterSymbol>().getValue().toString());
                    else
                        w.writeValue(
                            p->symbol.as<TypeParameterSymbol>().targetType.getType().toString());
                }
                w.endArray();
                w.writeProperty("conns");
                w.startArray();
                for (auto c : inst.getPortConnections()) {
                    w.startObject();
                    w.writeProperty("port");
                    w.writeValue(c->port.name);
                    if (auto e = c->getExpression()) {
                        w.writeProperty("expr");
                        ser.serialize(*e);
                    }
                    w.endObject();
                }
                w.endArray();
                w.endObject();
                break;
            }
            case SymbolKind::InstanceArray:
                w.startObject();
                w.writeProperty("instArray");
                w.writeValue(m.name);
                w.writeProperty("members");
                w.startArray();
                fingerprintScope(m.as<InstanceArraySymbol>(), ser, w);
                w.endArray();
                w.endObject();
                break;
            case SymbolKind::GenerateBlock: {
                auto& g = m.as<GenerateBlockSymbol>();
                if (g.isUninstantiated)
                    break;
                w.startObject();
                w.writeProperty("genBlock");
                w.writeValue(g.getExternalName());
                w.writeProperty("members");
                w.startArray();
                fingerprintScope(g, ser, w);
                w.endArray();
                w.endObject();
                break;
            }
            case SymbolKind::GenerateBlockArray:
                w.startObject();
                w.writeProperty("genArray");
                w.writeValue(m.as<GenerateBlockArraySymbol>().getExternalName());
                w.writeProperty("members");
                w.startArray();
                fingerprintScope(m.as<GenerateBlockArraySymbol>(), ser, w);
                w.endArray();
                w.endObject();
                break;
            case SymbolKind::Parameter:
                // Value only. The initializer expression of an overridden parameter is
                // written in the PARENT's scope, so it differs between instances whose
                // values are equal; it is not part of the body's content.
                w.startObject();
                w.writeProperty("param");
                w.writeValue(m.name);
                w.writeProperty("value");
                w.writeValue(m.as<ParameterSymbol>().getValue().toString());
                w.endObject();
                break;
            case SymbolKind::TypeParameter:
                w.startObject();
                w.writeProperty("typeParam");
                w.writeValue(m.name);
                w.writeProperty("type");
                w.writeValue(m.as<TypeParameterSymbol>().targetType.getType().toString());
                w.endObject();
                break;
            default:
                ser.serialize(m, /* inMembersArray */ true);
                break;
        }
    }
}

std::string fingerprint(Compilation& comp, const InstanceSymbol& inst) {
    JsonWriter w;
    ASTSerializer ser(comp, w);
    ser.setIncludeAddresses(false);
    ser.setIncludeSourceInfo(false);
    w.startArray();
    fingerprintScope(inst.body, ser, w);
    w.endArray();
    return std::string(w.view());
}

}  // namespace

struct Group {
    std::string first;  // path of the first instance seen
    std::string print;  // its fingerprint
    size_t count = 0;
};

struct Tally {
    const char* name;
    size_t groups = 0, shared = 0, mismatches = 0;
    void add(Group& g, const InstanceSymbol& inst, const std::string& fp) {
        if (g.count++ == 0) {
            groups++;
            g.first = inst.getHierarchicalPath();
            g.print = fp;
            return;
        }
        shared++;
        if (g.print == fp)
            return;
        if (mismatches++ < 5) {
            size_t i = 0;
            while (i < fp.size() && i < g.print.size() && fp[i] == g.print[i])
                i++;
            size_t from = i > 80 ? i - 80 : 0;
            std::printf("MISMATCH[%s] def %s\n  %s\n  %s\n  a: ...%s\n  b: ...%s\n", name,
                        std::string(inst.getDefinition().name).c_str(), g.first.c_str(),
                        inst.getHierarchicalPath().c_str(), g.print.substr(from, 200).c_str(),
                        fp.substr(from, 200).c_str());
        }
    }
};

int cmdSharing(Loaded& l) {
    auto t0 = std::chrono::steady_clock::now();
    l.comp->getAllDiagnostics();  // canonical bodies are only assigned during this visit
    double elab = seconds(t0);

    // Grouping A: slang's canonical body pointer. Note slang does not visit the inside
    // of a cached instance, so instances nested in one never get a pointer and each
    // counts as its own group here.
    // Grouping B: slang's InstanceCacheKey (definition + parameter values + interface
    // port connections) computed for every instance, nested or not. This is the key
    // slang's cache uses BEFORE it rejects bodies with upward names.
    std::unordered_map<const InstanceBodySymbol*, Group> byCanonical;
    struct KeyHash {
        size_t operator()(const InstanceCacheKey& k) const { return k.hash(); }
    };
    std::unordered_map<InstanceCacheKey, Group, KeyHash> byKey;
    Tally a{"canonical"}, b{"cachekey"};
    size_t instances = 0, withCanonical = 0, ineligible = 0, bytes = 0;

    auto t1 = std::chrono::steady_clock::now();
    forEachInstance(*l.comp, [&](const InstanceSymbol& inst) {
        instances++;
        std::string fp = fingerprint(*l.comp, inst);
        bytes += fp.size();

        const InstanceBodySymbol* canon = inst.getCanonicalBody();
        if (canon)
            withCanonical++;
        a.add(byCanonical[canon ? canon : &inst.body], inst, fp);

        bool valid = InstanceCacheKey::isEligibleForCaching(inst);
        if (valid) {
            SmallSet<const InstanceSymbol*, 2> visited;
            InstanceCacheKey key(inst, valid, visited);
            if (valid)
                b.add(byKey[std::move(key)], inst, fp);
        }
        if (!valid)
            ineligible++;
    });

    std::printf("instances                 %zu\n", instances);
    std::printf("canonical pointer set     %zu\n", withCanonical);
    std::printf("not eligible for caching  %zu\n", ineligible);
    for (auto* t : {&a, &b})
        std::printf("[%s] distinct bodies %zu, instances sharing an earlier body %zu, MISMATCHES %zu\n",
                    t->name, t->groups, t->shared, t->mismatches);
    std::fprintf(stderr, "parse %.2fs, full elaboration %.2fs, fingerprint %.2fs (%zu MB of JSON), peak RSS %ld MB\n",
                 l.parseSeconds, elab, seconds(t1), bytes >> 20, peakRssMb());
    // Only grouping A decides the result. Mismatches under grouping B are expected
    // wherever a body has upward names: that is exactly why slang (and we) must not
    // share on the key alone.
    return a.mismatches ? 1 : 0;
}

}  // namespace hexp
