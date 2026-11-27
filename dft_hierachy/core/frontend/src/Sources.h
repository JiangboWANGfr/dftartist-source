#pragma once
#include "hier/model/Source.h"
#include <slang/text/SourceManager.h>
#include <slang/ast/Symbol.h>
#include <map>
#include <unordered_map>

namespace hier::frontend {
// Borrows one compilation-owned instance syntax. Used only during synchronous
// extraction, including instances that share the same array / generate syntax.
class PortConnectionSources {
  public:
    explicit PortConnectionSources(const slang::syntax::SyntaxNode *);
    void reset(const slang::syntax::SyntaxNode *);
    const slang::syntax::SyntaxNode *connection(size_t pin, std::string_view name) const;
  private:
    // A short list is cheaper to scan than to allocate a name table. This is a
    // private lookup choice, not a limit on source records or supported ports.
    static constexpr size_t linearLimit = 8;
    const slang::syntax::SyntaxNode *syntax_ = nullptr;
    std::unordered_map<std::string_view, size_t> named_;
};

// Borrows the compilation's SourceManager. Physical buffers are fixed after open;
// syntax and macro expansion locations never escape L1.
class SourceCatalog {
  public:
    explicit SourceCatalog(const slang::SourceManager &manager);
    std::vector<model::SourceFileInput> files() const;
    std::optional<model::SourceRange> range(const slang::syntax::SyntaxNode *syntax) const;
    void add(std::vector<model::SourceRecord> &, std::string ref, model::SourceKind,
             const slang::syntax::SyntaxNode *) const;
  private:
    const slang::SourceManager &manager_;
    std::vector<std::pair<std::string, slang::BufferID>> files_;
    std::map<slang::BufferID, size_t> indices_;
};
} // namespace hier::frontend
