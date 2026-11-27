#pragma once
#include "hier/model/Model.h"
#include <slang/ast/symbols/BlockSymbols.h>
#include <slang/ast/symbols/InstanceSymbols.h>
#include <string>
#include <vector>

namespace hier::frontend::detail {
using slang::ast::Symbol;
using slang::ast::SymbolKind;
using slang::ast::Scope;
using slang::ast::InstanceArraySymbol;
using slang::ast::GenerateBlockSymbol;
using slang::ast::GenerateBlockArraySymbol;
// What a child position is, before it is turned into a model::ChildSlot.
struct RawSlot {
    const Symbol *symbol;            // Instance, UninstantiatedDef or PrimitiveInstance
    int32_t scope;                   // index into the scopes built alongside
    std::vector<int32_t> arrayIndex; // indices if it is an element of an instance array
};

// The single definition of child-slot order (docs/DESIGN.md 4.2). Used both when the
// design is opened, to number the bodies, and when a skeleton is extracted; the two
// must agree or instance keys would not mean the same thing in both places.
//
//  1. Members in source declaration order, depth-first.
//  2. A generate branch that was not selected yields nothing.
//  3. Generate loop iterations in elaboration order.
//  4. Instance array elements in ascending index order.
class SlotWalker {
  public:
    std::vector<model::ScopeInfo> scopes;
    std::vector<RawSlot> slots;

    void walk(const Scope &scope, int32_t scopeIndex) {
        for (auto &m : scope.members()) {
            switch (m.kind) {
            case SymbolKind::Instance:
            case SymbolKind::UninstantiatedDef:
            case SymbolKind::PrimitiveInstance:
                slots.push_back({&m, scopeIndex, {}});
                break;
            case SymbolKind::InstanceArray:
                walkArray(m.as<InstanceArraySymbol>(), scopeIndex, {});
                break;
            case SymbolKind::GenerateBlock: {
                auto &block = m.as<GenerateBlockSymbol>();
                if (!block.isUninstantiated)
                    walk(block, addScope(scopeIndex, block.getExternalName(), {}));
                break;
            }
            case SymbolKind::GenerateBlockArray: {
                auto &array = m.as<GenerateBlockArraySymbol>();
                std::string name = array.getExternalName();
                for (auto entry : array.entries) {
                    if (entry->isUninstantiated)
                        continue;
                    std::vector<int32_t> index;
                    if (auto i = entry->getArrayIndex())
                        index.push_back(i->as<int32_t>().value_or(0));
                    walk(*entry, addScope(scopeIndex, name, std::move(index)));
                }
                break;
            }
            default:
                break;
            }
        }
    }

  private:
    int32_t addScope(int32_t parent, std::string name, std::vector<int32_t> index) {
        scopes.push_back({parent, std::move(name), std::move(index)});
        return int32_t(scopes.size() - 1);
    }

    // Elements of a (possibly multi-dimensional) instance array. slang stores them in
    // ascending index order; the element's index is its position plus the range's lower
    // bound.
    void walkArray(const InstanceArraySymbol &array, int32_t scopeIndex,
                   std::vector<int32_t> prefix) {
        int32_t lower = array.range.lower();
        for (size_t i = 0; i < array.elements.size(); i++) {
            auto index = prefix;
            index.push_back(lower + int32_t(i));
            auto element = array.elements[i];
            if (element->kind == SymbolKind::InstanceArray)
                walkArray(element->as<InstanceArraySymbol>(), scopeIndex, std::move(index));
            else
                slots.push_back({element, scopeIndex, std::move(index)});
        }
    }
};

} // namespace hier::frontend::detail
