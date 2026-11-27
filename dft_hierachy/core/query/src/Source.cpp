#include "Source.h"
#include "SourceFileHash.h"
#include "SourceStream.h"
#include "ConnectionRefs.h"
#include "Cursor.h"
#include "Observe.h"
#include <algorithm>
#include <array>
#include <queue>

namespace hier::detail {
namespace {
const Error cancelled{ErrorCode::Cancelled, "source query cancelled"};
const Error absent{ErrorCode::NotFound, "object has no source of the requested kind"};
std::optional<size_t> referenceIndex(std::string_view ref, std::string_view prefix) {
    if (!ref.starts_with(prefix))
        return {};
    ref.remove_prefix(prefix.size());
    size_t index = 0;
    auto [end, ec] = std::from_chars(ref.data(), ref.data() + ref.size(), index);
    if (ref.empty() || ec != std::errc{} || end != ref.data() + ref.size())
        return {};
    return index;
}
Result<size_t> fileIndex(const db::SourceSnapshot &snapshot, std::string_view ref) {
    auto id = referenceIndex(ref, "f:");
    if (!id || *id >= snapshot.files.size() || ref != "f:" + std::to_string(*id))
        return Error{ErrorCode::NotFound, "source file is not in this snapshot"};
    return *id;
}

// Numeric reference identity; occurrence index has exactly InstKey DFS order.
// Only the selected page's identities are converted to SourceHit / strings.
using Identity = SourceIdentity;
using Stream = SourceStream;
Stream streamFor(const db::SourceSequence &sequence, const db::Occurrences &index) {
    Stream stream{&sequence, nullptr, {}, 0, 0};
    using Owner = db::SourceSequence::Owner;
    if (sequence.owner == Owner::Definition)
        return stream;
    stream.occurrences = sequence.owner == Owner::Instances ? &index.byDefinition[sequence.id]
                                                           : &index.byBody[sequence.id];
    stream.kind = std::string_view("ipsxr").find(sequence.ref[0]);
    auto suffix = std::string_view(sequence.ref).substr(2);
    auto colon = suffix.find(':');
    auto child = suffix.substr(0, colon);
    if (!child.empty())
        stream.child = uint32_t(*referenceIndex(child, ""));
    if (colon != std::string_view::npos)
        stream.local = *referenceIndex(suffix.substr(colon+1), "");
    return stream;
}
std::string refFor(const Identity &id, const db::Occurrences &index) {
    if (id[0] == 0)
        return "d:" + std::to_string(id[1]);
    auto key = model::formatInstKey(index.items[id[1]].key);
    if (id[2] == 0)
        return "i:" + key;
    return std::string(1, "ipsxr"[id[2]]) + ":" + key + ":" + std::to_string(id[3]);
}
} // namespace

Result<model::SourceSpan> source(const db::DesignDb &db, std::string_view ref,
                                 model::SourceKind kind, Cancel cancel) {
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "source cancelled"};
    if (kind != model::SourceKind::Definition && kind != model::SourceKind::Instantiation &&
        kind != model::SourceKind::Statement)
        return Error{ErrorCode::BadRequest, "invalid source kind"};
    auto snapshot = db.sourceSnapshot(cancel);
    if (!snapshot)
        return snapshot.error();
    auto definition = [&](size_t id) -> Result<model::SourceSpan> {
        if (kind != model::SourceKind::Definition || id >= (*snapshot)->definitions.size() ||
            !(*snapshot)->definitions[id])
            return absent;
        return (*snapshot)->span(*(*snapshot)->definitions[id]);
    };
    if (ref.starts_with("d:")) {
        auto id = referenceIndex(ref, "d:");
        if (!id)
            return Error{ErrorCode::BadRequest, "invalid definition reference"};
        return definition(*id);
    }
    auto inst = model::parseInstRef(ref);
    auto object = parseObject(ref);
    if (!inst && !object)
        return Error{ErrorCode::BadRequest, "invalid object reference"};
    auto key = inst ? *inst : object->inst;
    auto located = db.locate(key, cancel);
    if (!located)
        return located.error();
    if (inst && kind == model::SourceKind::Definition) {
        if (!located->steps.empty())
            return definition(located->steps.back().slot->def);
        auto skeleton = db.skeleton(located->body, cancel);
        if (!skeleton)
            return skeleton.error();
        return definition((*skeleton)->def);
    }
    auto body = located->body;
    std::string local;
    if (kind == model::SourceKind::Instantiation && (inst || object->kind == 'p')) {
        if (located->steps.empty())
            return absent;
        body = located->steps.back().parentBody;
        local = (inst ? "i:" : "p:") + std::to_string(key.back());
        if (!inst)
            local += ":" + std::to_string(object->index);
    } else if (object) {
        local = std::string(1, object->kind) + "::" + std::to_string(object->index);
    } else {
        return absent;
    }
    if (body == model::kNoBody)
        return absent;
    auto facts = db.connections(body, cancel);
    if (!facts)
        return facts.error();
    for (const auto &record : (*facts)->sources) {
        if (cancel.stop_requested())
            return Error{ErrorCode::Cancelled, "source cancelled"};
        if (record.ref == local && record.kind == kind)
            return (*snapshot)->span(record.range);
    }
    return absent;
}

Result<model::QueryResult<Page<model::SourceHit>>>
resolveSource(const db::DesignDb &db, std::string_view ref, size_t line,
              std::optional<size_t> column, const PageRequest &page, Cancel cancel) {
    if (page.limit <= 0 || line == 0 || (column && *column == 0))
        return Error{ErrorCode::BadRequest, "source line, column and page limit must be positive"};
    std::string binding;
    for (const auto &field : {std::string(ref), std::to_string(line),
                             column ? std::to_string(*column) : std::string("none"), std::string("1")})
        cursorField(binding, field);
    auto cursor = readCursor(page.cursor, "source.resolve", db.snapshotId(), binding, 5);
    if (!cursor)
        return cursor.error();
    if (cancel.stop_requested())
        return cancelled;
    auto snapshot = db.sourceSnapshot(cancel);
    if (!snapshot)
        return snapshot.error();
    auto file = fileIndex(**snapshot, ref);
    if (!file)
        return file.error();
    const auto &input = (*snapshot)->files[*file];
    if (line > input.lines.size())
        return Error{ErrorCode::BadRequest, "source line is outside the snapshot file"};
    const auto begin = input.lines[line-1], end = input.lineEnds[line-1];
    if (column && *column - 1 > end - begin)
        return Error{ErrorCode::BadRequest, "source column is outside the snapshot line"};
    const auto point = begin + (column ? *column - 1 : 0);
    // A line query includes its newline bytes; an empty final line has no bytes.
    const auto lineEnd = line < input.lines.size() ? input.lines[line] : input.size;
    auto sources = db.sourceIndex(cancel);
    if (!sources)
        return sources.error();
    auto occurrences = db.occurrences(cancel);
    if (!occurrences)
        return occurrences.error();
    const auto &groups = (*sources)->groups;
    const auto &positions = **occurrences;
    if ((!page.cursor.empty() && (*cursor)[0] >= groups.size()) || (*cursor)[1] > 1 || (*cursor)[3] > 4)
        return Error{ErrorCode::BadRequest, "invalid source cursor position"};
    if (!page.cursor.empty() && groups[(*cursor)[0]].range.file != *file)
        return Error{ErrorCode::BadRequest, "source cursor does not identify a range in this file"};
    const Identity resume{(*cursor)[1], (*cursor)[2], (*cursor)[3], (*cursor)[4]};
    auto matchesRange = [&](const db::SourceGroup &group) {
        return column ? group.range.start <= point && point < group.range.end
                      : group.range.start < lineEnd && begin < group.range.end;
    };
    if (cancel.stop_requested())
        return cancelled;
    // Keep the original cursor error even when its range is beyond the window.
    if (!page.cursor.empty() && !matchesRange(groups[(*cursor)[0]]))
        return Error{ErrorCode::BadRequest, "source cursor does not identify a matching range"};
    // L2's original file/start order is authoritative. Earlier ranges can still
    // overlap, so only discard other files and ranges starting after the query.
    const auto first = std::lower_bound(groups.begin(), groups.end(), *file,
        [](const db::SourceGroup &group, size_t wantedFile) { return group.range.file < wantedFile; });
    const auto last = std::upper_bound(first, groups.end(), *file,
        [](size_t wantedFile, const db::SourceGroup &group) { return wantedFile < group.range.file; });
    const auto stop = column
        ? std::upper_bound(first, last, point,
            [](size_t offset, const db::SourceGroup &group) { return offset < group.range.start; })
        : std::lower_bound(first, last, lineEnd,
            [](const db::SourceGroup &group, size_t offset) { return group.range.start < offset; });
    if (cancel.stop_requested())
        return cancelled;
    const auto firstGroup = page.cursor.empty() ? size_t(first - groups.begin()) : (*cursor)[0];
    const auto stopGroup = size_t(stop - groups.begin());
    model::QueryResult<Page<model::SourceHit>> result;
    struct Candidate {
        Identity id;
        size_t stream, position;
        bool operator>(const Candidate &other) const { return id > other.id; }
    };
    for (size_t g = firstGroup; g < stopGroup; ++g) {
        if (cancel.stop_requested())
            return cancelled;
        const auto &group = groups[g];
        if (!matchesRange(group))
            continue;
        std::vector<Stream> streams;
        std::priority_queue<Candidate, std::vector<Candidate>, std::greater<Candidate>> heap;
        for (const auto &sequence : group.sequences) {
            if (cancel.stop_requested())
                return cancelled;
            auto stream = streamFor(sequence, positions);
            size_t low = 0, high = stream.size();
            if (!page.cursor.empty() && g == (*cursor)[0]) {
                while (low < high) {
                    auto mid = low + (high-low)/2;
                    if (stream.identity(mid, positions) < resume)
                        low = mid+1;
                    else
                        high = mid;
                }
            }
            if (low < stream.size())
                heap.push({stream.identity(low, positions), streams.size(), low});
            streams.push_back(std::move(stream));
        }
        if (!page.cursor.empty() && g == (*cursor)[0] && (heap.empty() || heap.top().id != resume))
            return Error{ErrorCode::BadRequest, "source cursor does not identify a hit"};
        std::optional<Identity> previous;
        while (!heap.empty()) {
            auto candidate = heap.top();
            heap.pop();
            auto &stream = streams[candidate.stream];
            const auto next = candidate.position + 1;
            if (next < stream.size())
                heap.push({stream.identity(next, positions), candidate.stream, next});
            if (previous && *previous == candidate.id)
                continue;
            previous = candidate.id;
            observation::emit({observation::Kind::SourceCandidate, g});
            if (cancel.stop_requested())
                return cancelled;
            if (result.result.items.size() == size_t(page.limit)) {
                const auto &id = candidate.id;
                result.result.next = makeCursor("source.resolve", db.snapshotId(), binding,
                                                {g, id[0], id[1], id[2], id[3]});
                return result;
            }
            observation::emit({observation::Kind::SourceHitMaterialize, g});
            if (cancel.stop_requested())
                return cancelled;
            model::SourceHit hit{refFor(candidate.id, positions), group.kind, (*snapshot)->span(group.range), {}};
            hit.refKind = candidate.id[0] == 0 ? model::SourceRefKind::Definition
                                              : model::SourceRefKind::Object;
            if (candidate.id[0] == 1)
                hit.inst = model::instRef(positions.items[candidate.id[1]].key);
            result.result.items.push_back(std::move(hit));
            observation::emit({observation::Kind::SourceHitEmit, g, result.result.items.size()});
            if (cancel.stop_requested())
                return cancelled;
        }
    }
    return result;
}
Result<model::SourceRead> readSource(const db::DesignDb &db, std::string_view ref, Cancel cancel) {
    auto snapshot = db.sourceSnapshot(cancel);
    if (!snapshot)
        return snapshot.error();
    auto id = fileIndex(**snapshot, ref);
    if (!id)
        return id.error();
    auto text = db::readSourceBytes((*snapshot)->files[*id], cancel);
    if (!text)
        return text.error();
    const bool utf8 = db::sourceUtf8(*text, cancel);
    if (cancel.stop_requested())
        return cancelled;
    if (!utf8)
        return Error{ErrorCode::Unsupported, "source file is not valid UTF-8"};
    auto hash = db::sourceHash(*text, cancel);
    if (!hash)
        return hash.error();
    return model::SourceRead{std::move(*text), *hash, *hash == (*snapshot)->files[*id].hash};
}
Result<model::InputCheck> checkInputs(const db::DesignDb &db, Cancel cancel) {
    auto snapshot = db.sourceSnapshot(cancel);
    if (!snapshot)
        return snapshot.error();
    model::InputCheck result;
    for (size_t i = 0; i < (*snapshot)->files.size(); ++i) {
        const auto &file = (*snapshot)->files[i];
        auto hash = db::hashSourceFile(file, cancel);
        if (!hash) {
            if (hash.error().code == ErrorCode::Cancelled)
                return hash.error();
            result.complete = false;
            result.changed.push_back("f:" + std::to_string(i));
            continue;
        }
        if (*hash != file.hash)
            result.changed.push_back("f:" + std::to_string(i));
    }
    if (cancel.stop_requested())
        return cancelled;
    return result;
}
} // namespace hier::detail
