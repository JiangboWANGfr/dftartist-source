#include "service/Hierarchy.h"

#include <map>
#include <optional>
#include <string>
#include <vector>

#include "service/SlangHelpers.h"
#include "slang/ast/Compilation.h"
#include "slang/ast/Symbol.h"
#include "slang/ast/symbols/CompilationUnitSymbols.h"  // RootSymbol
#include "slang/ast/symbols/InstanceSymbols.h"
#include "slang/text/SourceManager.h"

using namespace slang::ast;

namespace {

// select_roots (dump variant): all non-leaf tops; fallback to all tops.
std::vector<const InstanceSymbol*> selectRoots(Compilation& comp) {
    std::vector<const InstanceSymbol*> tops(comp.getRoot().topInstances.begin(),
                                            comp.getRoot().topInstances.end());
    std::vector<const InstanceSymbol*> nonleaf;
    for (auto* t : tops) {
        std::vector<const Symbol*> kids;
        hdl::service::collectChildren(t->body, kids);
        if (!kids.empty()) nonleaf.push_back(t);
    }
    return nonleaf.empty() ? tops : nonleaf;
}

}  // namespace

namespace hdl::service {

hdl::ir::DesignHierarchy buildHierarchy(Compilation& comp) {
    const slang::SourceManager& sm = *comp.getSourceManager();
    hdl::ir::DesignHierarchy h;

    auto roots = selectRoots(comp);
    for (auto* r : roots) h.rootInstanceIds.push_back(r->getHierarchicalPath());

    std::map<std::string, bool> defSeen;
    std::map<std::string, bool> instSeen;

    auto addDef = [&](const Symbol& s) -> std::string {
        DefInfo di = defInfo(s, sm);
        if (!defSeen.count(di.id)) {
            defSeen[di.id] = true;
            hdl::ir::ModuleDefinition md;
            md.id = di.id;
            md.designName = di.designName;
            if (di.hasPath) md.filePath = di.filePath;
            h.definitions.emplace_back(di.id, std::move(md));
        }
        return di.id;
    };

    struct Frame {
        const Symbol* sym;
        std::optional<std::string> parent;
    };
    std::vector<Frame> stack;
    for (auto it = roots.rbegin(); it != roots.rend(); ++it)
        stack.push_back({*it, std::nullopt});

    while (!stack.empty()) {
        Frame f = stack.back();
        stack.pop_back();
        const Symbol& s = *f.sym;
        std::string id = s.getHierarchicalPath();
        if (instSeen.count(id)) continue;
        instSeen[id] = true;

        std::vector<const Symbol*> kids;
        if (isRealInstance(s)) collectChildren(s.as<InstanceSymbol>().body, kids);

        hdl::ir::InstanceNode node;
        node.id = id;
        node.instanceName = leafName(s);
        node.definitionId = addDef(s);
        node.parentInstanceId = f.parent;
        node.isLeaf = kids.empty();
        for (auto* c : kids) node.childInstanceIds.push_back(c->getHierarchicalPath());
        h.instances.emplace_back(id, std::move(node));

        for (auto it = kids.rbegin(); it != kids.rend(); ++it)
            stack.push_back({*it, id});
    }
    return h;
}

}  // namespace hdl::service
