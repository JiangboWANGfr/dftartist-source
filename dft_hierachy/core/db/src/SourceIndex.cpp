#include "hier/db/DesignDb.h"
#include "Observe.h"
#include "SourceGroups.h"
#include "SourceLines.h"
#include <algorithm>
#include <tuple>

namespace hier::db {
namespace {
struct SourceIndexInterrupted {};
void observeSequence(observation::Kind kind, size_t group, Cancel cancel) {
    if (cancel.stop_requested())
        throw SourceIndexInterrupted{};
    observation::emit({kind, group});
    if (cancel.stop_requested())
        throw SourceIndexInterrupted{};
}
bool orderSequences(std::vector<SourceSequence> &sequences, size_t group, Cancel cancel) {
    auto identity = [](const SourceSequence &s) { return std::tie(s.owner, s.id, s.ref); };
    try {
        std::sort(sequences.begin(), sequences.end(), [&](const auto &a, const auto &b) {
            observeSequence(observation::Kind::SourceIndexSortCompare, group, cancel);
            return identity(a) < identity(b);
        });
        sequences.erase(std::unique(sequences.begin(), sequences.end(), [&](const auto &a, const auto &b) {
            observeSequence(observation::Kind::SourceIndexDedupCandidate, group, cancel);
            return identity(a) == identity(b);
        }), sequences.end());
    } catch (const SourceIndexInterrupted &) {
        // Sorting may leave unspecified order on interruption. Its sole owner is
        // the local, unpublished builder; the caller discards it on this path.
        return false;
    }
    return !cancel.stop_requested();
}
} // namespace
model::SourcePos SourceFile::position(size_t offset) const {
    auto next = std::upper_bound(lines.begin(), lines.end(), offset);
    auto line = size_t(next - lines.begin()) - 1;
    return {offset, line + 1, offset - lines[line] + 1};
}
model::SourceSpan SourceSnapshot::span(model::SourceRange range) const {
    const auto &file = files.at(range.file);
    return {"f:" + std::to_string(range.file), file.path, file.position(range.start),
            file.position(range.end), file.hash};
}
Result<std::shared_ptr<const SourceSnapshot>> DesignDb::sourceSnapshot(Cancel cancel) const {
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "source snapshot cancelled"};
    if (sourceSnapshot_)
        return sourceSnapshot_;
    auto result = std::make_shared<SourceSnapshot>();
    auto inputs = frontend_->sourceFiles();
    for (auto &input : inputs) {
        auto hash = sourceHash(input.text, cancel);
        if (!hash)
            return hash.error();
        SourceFile file{std::move(input.path), std::move(*hash), input.text.size(), {0}, {}};
        if (!detail::indexSourceLines(input.text, file.lines, file.lineEnds, cancel))
            return Error{ErrorCode::Cancelled, "source line indexing cancelled"};
        result->files.push_back(std::move(file));
    }
    result->definitions = frontend_->definitionSources();
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "source snapshot cancelled"};
    sourceSnapshot_ = std::move(result);
    return sourceSnapshot_;
}
Result<std::shared_ptr<const SourceIndex>> DesignDb::sourceIndex(Cancel cancel) const {
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "source indexing cancelled"};
    if (sourceIndex_)
        return sourceIndex_;
    auto snapshot = sourceSnapshot(cancel);
    if (!snapshot)
        return snapshot.error();
    auto result = std::make_shared<SourceIndex>();
    detail::SourceGroups groups;
    auto add = [&](model::SourceRange range, model::SourceKind kind, SourceSequence sequence) {
        if (cancel.stop_requested())
            return;
        observation::emit({observation::Kind::SourceIndexRange, range.file});
        if (cancel.stop_requested())
            return;
        groups.add(range, kind, std::move(sequence));
    };
    for (size_t i = 0; i < (*snapshot)->definitions.size(); ++i) {
        if (auto range = (*snapshot)->definitions[i]) {
            add(*range, model::SourceKind::Definition, {SourceSequence::Owner::Definition, i, ""});
            add(*range, model::SourceKind::Definition, {SourceSequence::Owner::Instances, i, "i:"});
        }
        if (cancel.stop_requested())
            return Error{ErrorCode::Cancelled, "source indexing cancelled"};
    }
    for (size_t body = 0; body < frontend_->bodyCount(); ++body) {
        auto facts = connections(model::BodyId(body), cancel);
        if (!facts)
            return facts.error();
        for (const auto &source : (*facts)->sources) {
            add(source.range, source.kind, {SourceSequence::Owner::Body, body, source.ref});
            if (cancel.stop_requested())
                return Error{ErrorCode::Cancelled, "source indexing cancelled"};
        }
    }
    if (!groups.finish(result->groups, cancel, orderSequences))
        return Error{ErrorCode::Cancelled, "source indexing cancelled"};
    observation::emit({observation::Kind::SourceIndexPublish, 0, result->groups.size()});
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "source indexing cancelled"};
    sourceIndex_ = std::move(result);
    return sourceIndex_;
}
} // namespace hier::db
