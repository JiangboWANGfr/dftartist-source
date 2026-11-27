#pragma once
#include "hier/model/Model.h"
#include "hier/model/Result.h"

namespace hier::db {
struct SourceFile {
    std::string path, hash;
    size_t size = 0;
    std::vector<size_t> lines, lineEnds;
    model::SourcePos position(size_t offset) const;
};
struct SourceSnapshot {
    std::vector<SourceFile> files;
    std::vector<std::optional<model::SourceRange>> definitions;
    model::SourceSpan span(model::SourceRange range) const;
};
struct SourceSequence {
    // A definition emits once; instances use byDefinition, body objects use byBody.
    enum class Owner { Definition, Instances, Body };
    Owner owner = Owner::Body;
    size_t id = 0;
    std::string ref;
};
struct SourceGroup {
    model::SourceRange range;
    model::SourceKind kind;
    std::vector<SourceSequence> sequences;
};
struct SourceIndex {
    // Ordered by file, range start/end, kind. Each range is shared by occurrences.
    std::vector<SourceGroup> groups;
};
Result<std::string> sourceHash(std::string_view bytes, Cancel cancel);
Result<std::string> readSourceBytes(const SourceFile &, Cancel cancel);
bool sourceUtf8(std::string_view bytes, Cancel cancel = {});
} // namespace hier::db
