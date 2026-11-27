#pragma once
#include "ChildSlots.h"
#include <algorithm>
#include <memory>
#include <unordered_map>

namespace hier::frontend::detail {
// One recently queried parent pair, not a table for every parent in the design.
// Symbols / bodies borrow the immutable Compilation. Destroy this metadata first.
class AnalysisSlotRouting {
  public:
    using Body = slang::ast::InstanceBodySymbol;
    using Symbol = slang::ast::Symbol;
    AnalysisSlotRouting() = default;
    AnalysisSlotRouting(const AnalysisSlotRouting &) = delete;
    AnalysisSlotRouting &operator=(const AnalysisSlotRouting &) = delete;

    template <class Collect>
    const Body *counterpart(const Body &original, const Body &representative,
                            const Symbol &child, Collect &&collect) {
        if (!recent_ || recent_->original != &original ||
            recent_->representative != &representative) {
            auto complete = std::make_unique<Routing>();
            complete->original = &original;
            complete->representative = &representative;
            auto first = collect(original), second = collect(representative);
            const auto count = std::min(first.size(), second.size());
            complete->children.reserve(count);
            for (size_t i = 0; i < count; ++i)
                if (second[i].symbol->kind == slang::ast::SymbolKind::Instance)
                    complete->children.try_emplace(
                        first[i].symbol, &second[i].symbol->template as<slang::ast::InstanceSymbol>().body);
            // Match the original first eligible slot, including an eligible
            // self-correspondence. The caller keeps its original recursion guard.
            recent_.swap(complete);
        }
        const auto found = recent_->children.find(&child);
        // Copy the AST pointer before recursive resolution can replace recent_.
        return found == recent_->children.end() ? nullptr : found->second;
    }

  private:
    struct Routing {
        const Body *original = nullptr, *representative = nullptr;
        std::unordered_map<const Symbol *, const Body *> children;
    };
    std::unique_ptr<Routing> recent_;
};
} // namespace hier::frontend::detail
