#include "Sources.h"
#include <slang/syntax/AllSyntax.h>
#include <cerrno>
#include <filesystem>
#include <sys/stat.h>

namespace hier::frontend {
using namespace slang;
using namespace slang::syntax;

SourceCatalog::SourceCatalog(const SourceManager &manager) : manager_(manager) {
    std::map<std::string, std::vector<BufferID>> paths;
    for (auto buffer : manager.getAllBuffers()) {
        if (!manager.isFileLoc(SourceLocation(buffer, 0)))
            continue;
        auto path = manager.getFullPath(buffer);
        // readSource stores an absolute disk path. assignText buffers (including
        // command-line defines) have synthetic relative names, even when Slang
        // categorizes them as file locations rather than expansion locations.
        if (!path.is_absolute())
            continue;
        std::error_code error;
        auto normalized = std::filesystem::weakly_canonical(path, error);
        if (error)
            normalized = path.lexically_normal();
        paths[normalized.string()].push_back(buffer);
    }
    // Canonical paths collapse symbolic links, but distinct hard-link names need
    // physical identity. Sorted traversal chooses the smallest canonical alias
    // and keeps the final FileRef table sorted without all-pairs path comparisons.
    std::map<std::pair<dev_t, ino_t>, size_t> physical;
    for (auto &[path, buffers] : paths) {
        struct stat status {};
        int rc;
        do {
            rc = ::stat(path.c_str(), &status);
        } while (rc != 0 && errno == EINTR);
        if (rc != 0)
            throw std::filesystem::filesystem_error("cannot identify source input", path,
                                                    {errno, std::generic_category()});
        auto [entry, inserted] = physical.emplace(std::pair{status.st_dev, status.st_ino},
                                                  files_.size());
        if (inserted)
            files_.emplace_back(path, buffers.front());
        for (auto buffer : buffers)
            indices_.emplace(buffer, entry->second);
    }
}
std::vector<model::SourceFileInput> SourceCatalog::files() const {
    std::vector<model::SourceFileInput> result;
    for (auto &[path, buffer] : files_) {
        auto text = manager_.getSourceText(buffer);
        // Slang owns an extra NUL sentinel, which is not an input byte.
        if (!text.empty())
            text.remove_suffix(1);
        result.push_back({path, text});
    }
    return result;
}
std::optional<model::SourceRange> SourceCatalog::range(const SyntaxNode *node) const {
    if (!node)
        return {};
    auto first = node->getFirstToken(), last = node->getLastToken();
    auto start = first.location(), end = last.range().end();
    while (manager_.isMacroLoc(start))
        start = manager_.getExpansionRange(start).start();
    auto lastLocation = last.location();
    while (manager_.isMacroLoc(lastLocation)) {
        auto expansion = manager_.getExpansionRange(lastLocation);
        end = expansion.end();
        lastLocation = expansion.start();
    }
    auto a = indices_.find(start.buffer()), b = indices_.find(end.buffer());
    if (a == indices_.end() || b == indices_.end() || a->second != b->second ||
        start.offset() >= end.offset())
        return {};
    return model::SourceRange{a->second, start.offset(), end.offset()};
}
PortConnectionSources::PortConnectionSources(const SyntaxNode *node) {
    if (!node || node->kind != SyntaxKind::HierarchicalInstance)
        return;
    syntax_ = node;
    const auto &connections = node->as<HierarchicalInstanceSyntax>().connections;
    if (connections.size() <= linearLimit)
        return;
    size_t position = 0;
    for (auto item : connections) {
        if (item->kind == SyntaxKind::NamedPortConnection)
            named_.try_emplace(item->as<NamedPortConnectionSyntax>().name.valueText(),
                               position);
        ++position;
    }
}
void PortConnectionSources::reset(const SyntaxNode *node) {
    if (!node || node->kind != SyntaxKind::HierarchicalInstance)
        node = nullptr;
    if (syntax_ != node)
        *this = PortConnectionSources(node);
}
const SyntaxNode *PortConnectionSources::connection(size_t pin, std::string_view name) const {
    if (!syntax_)
        return nullptr;
    // Slang already owns the random-access node list, including empty slots.
    const auto &connections = syntax_->as<HierarchicalInstanceSyntax>().connections;
    size_t namedPosition = connections.size();
    if (connections.size() <= linearLimit) {
        size_t position = 0;
        for (auto item : connections) {
            if (item->kind == SyntaxKind::NamedPortConnection &&
                item->as<NamedPortConnectionSyntax>().name.valueText() == name) {
                namedPosition = position;
                break;
            }
            ++position;
        }
    } else if (auto found = named_.find(name); found != named_.end())
        namedPosition = found->second;
    // The original scan counted empty / wildcard / named slots as positions too.
    // Even a diagnosed mixed list must choose its first eligible syntax item.
    const SyntaxNode *ordered = pin < connections.size() ? connections[pin] : nullptr;
    if (ordered && ordered->kind != SyntaxKind::OrderedPortConnection)
        ordered = nullptr;
    if (namedPosition < connections.size() && (!ordered || namedPosition < pin))
        return connections[namedPosition];
    if (ordered)
        return ordered;
    return nullptr;
}
void SourceCatalog::add(std::vector<model::SourceRecord> &out, std::string ref,
                        model::SourceKind kind, const SyntaxNode *node) const {
    // ANSI port symbols can point at the whole port declaration. Use the
    // individual declarator just as ordinary variable/net symbols do.
    if (node && kind == model::SourceKind::Definition && node->kind == SyntaxKind::ImplicitAnsiPort)
        node = node->as<ImplicitAnsiPortSyntax>().declarator;
    if (auto physical = range(node))
        out.push_back({std::move(ref), kind, *physical});
}
} // namespace hier::frontend
