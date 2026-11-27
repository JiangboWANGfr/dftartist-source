#pragma once
#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace hier::model {
enum class SourceKind { Definition, Instantiation, Statement };
enum class SourceRefKind { Definition, Object };
struct SourcePos {
    size_t offset = 0, line = 1, column = 1;
};
struct SourceSpan {
    std::string file, path;
    SourcePos start, end;
    std::string contentHash;
};
struct SourceHit {
    std::string ref;
    SourceKind kind = SourceKind::Definition;
    SourceSpan span;
    std::optional<std::string> inst;
    std::optional<SourceRefKind> refKind = std::nullopt;
};
struct SourceRead {
    std::string text, contentHash;
    bool matchesSnapshot = false;
};
struct InputCheck {
    std::vector<std::string> changed;
    bool complete = true;
};

// Snapshot facts exchanged between L1 and L2, never serialized directly.
struct SourceRange {
    size_t file = 0, start = 0, end = 0;
    bool operator==(const SourceRange &) const = default;
};
struct SourceRecord {
    std::string ref; // same body-relative numbering as BodyConnections
    SourceKind kind = SourceKind::Definition;
    SourceRange range;
};
struct SourceFileInput {
    std::string path;
    // Borrowed immutable bytes, valid for the lifetime of the originating Frontend.
    std::string_view text;
};
} // namespace hier::model
