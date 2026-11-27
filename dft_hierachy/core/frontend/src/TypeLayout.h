#pragma once
#include "hier/model/Connections.h"
#include <slang/ast/symbols/VariableSymbols.h>
#include <slang/ast/types/AllTypes.h>
namespace hier::frontend {
inline bool hasBitLayout(const slang::ast::Type &type) {
    using namespace slang::ast;
    auto &t = type.getCanonicalType();
    if (t.isIntegral())
        return true;
    if (t.kind == SymbolKind::FixedSizeUnpackedArrayType)
        return hasBitLayout(t.as<FixedSizeUnpackedArrayType>().elementType);
    if (t.isUnpackedStruct() || t.isUnpackedUnion()) {
        const Scope *scope = t.isUnpackedStruct()
                                 ? static_cast<const Scope *>(&t.as<UnpackedStructType>())
                                 : static_cast<const Scope *>(&t.as<UnpackedUnionType>());
        for (auto &field : scope->membersOfType<FieldSymbol>())
            if (!hasBitLayout(field.getType()))
                return false;
        return true;
    }
    return false;
}
inline uint64_t bitWidth(const slang::ast::Type &t) {
    return hasBitLayout(t) ? t.getSelectableWidth() : 0;
}
inline std::vector<model::Dim> dimensions(const slang::ast::Type &type) {
    using namespace slang::ast;
    std::vector<model::Dim> result;
    auto t = &type.getCanonicalType();
    while (true) {
        if (t->kind == SymbolKind::FixedSizeUnpackedArrayType) {
            auto &a = t->as<FixedSizeUnpackedArrayType>();
            result.push_back({a.range.left, a.range.right, false});
            t = &a.elementType.getCanonicalType();
        } else if (t->kind == SymbolKind::PackedArrayType) {
            auto &a = t->as<PackedArrayType>();
            result.push_back({a.range.left, a.range.right, true});
            t = &a.elementType.getCanonicalType();
        } else
            return result;
    }
}
inline std::vector<model::MemberInfo> typeMembers(const slang::ast::Type &type) {
    using namespace slang::ast;
    auto t = &type.getCanonicalType();
    while (t->kind == SymbolKind::FixedSizeUnpackedArrayType ||
           t->kind == SymbolKind::PackedArrayType)
        t = &(t->kind == SymbolKind::PackedArrayType
                  ? t->as<PackedArrayType>().elementType
                  : t->as<FixedSizeUnpackedArrayType>().elementType)
                 .getCanonicalType();
    std::vector<model::MemberInfo> result;
    const Scope *scope = nullptr;
    if (t->kind == SymbolKind::PackedStructType)
        scope = &t->as<PackedStructType>();
    if (t->kind == SymbolKind::UnpackedStructType)
        scope = &t->as<UnpackedStructType>();
    if (t->kind == SymbolKind::PackedUnionType)
        scope = &t->as<PackedUnionType>();
    if (t->kind == SymbolKind::UnpackedUnionType)
        scope = &t->as<UnpackedUnionType>();
    if (scope)
        for (auto &field : scope->membersOfType<FieldSymbol>()) {
            auto &ft = field.getType();
            result.push_back({std::string(field.name),
                              ft.toString(),
                              {field.bitOffset, bitWidth(ft)},
                              ft.isSigned(),
                              dimensions(ft),
                              typeMembers(ft)});
        }
    return result;
}
} // namespace hier::frontend
