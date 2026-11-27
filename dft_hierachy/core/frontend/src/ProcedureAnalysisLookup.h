#pragma once
#include <slang/analysis/AnalyzedProcedure.h>
#include <slang/ast/Symbol.h>
#include <map>
#include <span>
#include <string>
#include <tuple>
#include <unordered_map>

namespace hier::frontend::detail {
// Extraction-local metadata. Both spans and returned procedures borrow the
// completed AnalysisManager / Compilation, which must outlive this lookup.
class ProcedureAnalysisLookup {
  public:
    using Procedure = slang::analysis::AnalyzedProcedure;
    using Symbol = slang::ast::Symbol;
    ProcedureAnalysisLookup(std::span<const Procedure> direct,
                            std::span<const Procedure> canonical)
        : direct_(direct), canonical_(canonical) {}
    ProcedureAnalysisLookup(const ProcedureAnalysisLookup &) = delete;
    ProcedureAnalysisLookup &operator=(const ProcedureAnalysisLookup &) = delete;

    template <class Relative> const Procedure *find(const Symbol &source, Relative &&relative) {
        if (!directReady_) {
            decltype(identities_) complete;
            complete.reserve(direct_.size());
            for (const auto &procedure : direct_)
                complete[procedure.analyzedSymbol] = &procedure; // Original last match wins.
            identities_.swap(complete);
            directReady_ = true;
        }
        if (auto found = identities_.find(&source); found != identities_.end())
            return found->second;
        if (canonical_.empty())
            return nullptr;
        if (!canonicalReady_) {
            decltype(signatures_) complete;
            for (const auto &procedure : canonical_) {
                const auto &symbol = *procedure.analyzedSymbol;
                complete[{symbol.kind, symbol.location, relative(symbol)}] = &procedure;
            }
            signatures_.swap(complete);
            canonicalReady_ = true;
        }
        const auto found = signatures_.find({source.kind, source.location, relative(source)});
        return found == signatures_.end() ? nullptr : found->second;
    }

  private:
    using Signature = std::tuple<slang::ast::SymbolKind, slang::SourceLocation, std::string>;
    std::span<const Procedure> direct_, canonical_;
    std::unordered_map<const Symbol *, const Procedure *> identities_;
    std::map<Signature, const Procedure *> signatures_;
    bool directReady_ = false, canonicalReady_ = false;
};
} // namespace hier::frontend::detail
