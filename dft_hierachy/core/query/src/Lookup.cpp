#include "Lookup.h"
#include "ConnectionRefs.h"
#include "Cursor.h"
#include "HierarchyPath.h"
#include "InstanceDescriptions.h"
#include "SearchPathText.h"
#include "SlotPathPrefix.h"
#include <algorithm>
#include <array>
#include <set>
#include <tuple>

namespace hier::detail {
namespace {
using namespace model;
const Error cancelled{ErrorCode::Cancelled, "lookup cancelled"};
const Error badCursor{ErrorCode::BadRequest, "cursor position is outside this query"};

Result<uint32_t> definitionIndex(std::string_view ref) {
    if (!ref.starts_with("d:"))
        return Error{ErrorCode::BadRequest, "expected definition reference"};
    ref.remove_prefix(2);
    uint32_t index = 0;
    auto [end, ec] = std::from_chars(ref.data(), ref.data() + ref.size(), index);
    if (ref.empty() || ec != std::errc{} || end != ref.data() + ref.size())
        return Error{ErrorCode::BadRequest, "malformed definition reference"};
    return index;
}

// The description is borrowed until the next occurrence is described. Facts are
// pinned through this occurrence's enumeration, including with a zero-byte cache.
struct Candidates {
    const InstInfo *instance = nullptr;
    const BodySkeleton *skeleton = nullptr;
    const ChildSlot *slot = nullptr;
    std::shared_ptr<const BodyConnections> facts;
    size_t count = 0;
};
Result<Candidates> candidates(InstanceDescriptions &descriptions, const db::DesignDb &db,
                              const db::Occurrence &occurrence, size_t kind, Cancel cancel) {
    if (cancel.stop_requested())
        return cancelled;
    Candidates result;
    auto instance = descriptions.get(occurrence.key, cancel);
    if (!instance)
        return instance.error().code == ErrorCode::Cancelled && cancel.stop_requested()
                   ? cancelled : instance.error();
    result.instance = *instance;
    if (kind == 1) {
        result.count = 1;
    } else if (kind == 2) {
        if (occurrence.body != kNoBody) {
            auto sk = db.skeleton(occurrence.body, cancel);
            if (!sk)
                return sk.error();
            result.skeleton = *sk;
            result.count = result.skeleton->ports.size();
        } else {
            auto at = db.locate(occurrence.key, cancel);
            if (!at)
                return at.error();
            result.slot = at->steps.back().slot;
            result.count = result.slot->blackboxPins.size();
        }
    } else if (occurrence.body != kNoBody) {
        auto facts = db.connections(occurrence.body, cancel);
        if (!facts)
            return facts.error();
        result.facts = std::move(*facts);
        result.count = kind == 3 ? result.facts->signals.size()
                       : kind == 4 ? result.facts->processes.size()
                                   : result.facts->registers.size();
    }
    return result;
}
Result<bool> matchingHit(const Candidates &items, size_t kind, size_t index,
                         std::string_view text, SearchPathText &pathMatch,
                         HierarchyPathValidator &signalPaths, ObjectHit *result) {
    // Names/local paths borrow pinned facts. A full hit is only constructed for
    // an accepted page row; lookahead still validates the same frontend paths.
    std::string generated;
    std::string_view name, local;
    if (kind == 1) {
        name = items.instance->name;
    } else if (kind == 2) {
        name = items.skeleton ? items.skeleton->ports[index].name : items.slot->blackboxPins[index];
        generated = escapeSegment(name);
        local = generated;
    } else if (kind == 3) {
        name = items.facts->signals[index].name;
        local = items.facts->signals[index].localPath;
    } else {
        generated = (kind == 4 ? "@process:" : "@register:") + std::to_string(index);
        name = generated;
        local = generated;
    }
    const bool appended = kind > 1 && !name.empty();
    const bool matches = name.find(text) != std::string_view::npos ||
                         pathMatch.matches(local, appended) ||
                         (kind == 1 && items.instance->defName.find(text) != std::string::npos);
    std::optional<std::vector<std::string>> displayPath;
    if ((kind == 2 || kind == 3) && !name.empty()) {
        // A malformed frontend path must still fail even when it does not
        // match. Both paths use the same grammar and preserve error order.
        if (matches && result) {
            auto path = displayHierarchyPath(local, items.instance->path);
            if (!path)
                return Error{ErrorCode::Internal, "invalid frontend object path: " + std::string(local)};
            displayPath = std::move(path.value());
        } else if (kind == 3 ? !signalPaths.validate(local)
                             : !validateHierarchyPath(local)) {
            return Error{ErrorCode::Internal, "invalid frontend object path: " + std::string(local)};
        }
    }
    if (!matches || !result)
        return matches;
    result->kind = HitKind(kind);
    result->inst = items.instance->ref;
    result->def = items.instance->def;
    result->name = name;
    if (displayPath)
        result->path = std::move(*displayPath);
    else
        result->path = items.instance->path;
    result->pathText = items.instance->pathText;
    if (appended) {
        result->pathText += '.';
        result->pathText += local;
    }
    if (kind == 1) {
        result->ref = items.instance->ref;
    } else {
        constexpr std::array<char, 6> prefixes{'d', 'i', 'p', 's', 'x', 'r'};
        result->ref = std::string(1, prefixes[kind]) + ":" + items.instance->ref.substr(2) + ":" +
                     std::to_string(index);
        if (kind > 3)
            result->path.push_back(result->name);
    }
    return true;
}
} // namespace

Result<model::QueryResult<Page<model::InstInfo>>>
instancesOf(const Design &, const db::DesignDb &db, std::string_view definition,
            const PageRequest &page, Cancel cancel) {
    if (page.limit <= 0)
        return Error{ErrorCode::BadRequest, "limit must be positive"};
    auto id = definitionIndex(definition);
    if (!id)
        return id.error();
    if (*id >= db.frontend().definitions().size())
        return Error{ErrorCode::NotFound, "no such definition"};
    auto binding = model::defRef(*id);
    auto cursor = readCursor(page.cursor, "instancesOf", db.snapshotId(), binding, 1);
    if (!cursor)
        return cursor.error();
    if (cancel.stop_requested())
        return cancelled;
    auto occurrences = db.occurrences(cancel);
    if (!occurrences)
        return occurrences.error();
    const auto &list = (*occurrences)->byDefinition[*id];
    size_t position = cursor->front();
    if (position > list.size())
        return badCursor;
    model::QueryResult<Page<model::InstInfo>> result;
    auto count = std::min(size_t(page.limit), list.size() - position);
    auto stop = position + count;
    InstanceDescriptions descriptions(db);
    for (; position < stop; ++position) {
        if (cancel.stop_requested())
            return cancelled;
        auto instance = descriptions.get((*occurrences)->items[list[position]].key, cancel);
        if (!instance)
            return instance.error().code == ErrorCode::Cancelled && cancel.stop_requested()
                       ? cancelled : instance.error();
        result.result.items.push_back(**instance);
    }
    if (position < list.size())
        result.result.next = makeCursor("instancesOf", db.snapshotId(), binding, {position});
    if (cancel.stop_requested())
        return cancelled;
    return result;
}

Result<model::QueryResult<Page<model::ObjectHit>>>
search(const Design &, const db::DesignDb &db, const model::SearchQuery &query,
       const PageRequest &page, Cancel cancel) {
    if (page.limit <= 0)
        return Error{ErrorCode::BadRequest, "limit must be positive"};
    std::array<bool, 6> kinds;
    kinds.fill(!query.kinds.has_value());
    if (query.kinds)
        for (auto kind : *query.kinds) {
            auto index = static_cast<size_t>(kind);
            if (index >= kinds.size())
                return Error{ErrorCode::BadRequest, "invalid search kind"};
            kinds[index] = true;
        }
    std::optional<model::InstKey> scope;
    if (query.scope) {
        scope = model::parseInstRef(*query.scope);
        if (!scope)
            return Error{ErrorCode::BadRequest, "scope must be an instance reference"};
    }
    std::string binding;
    cursorField(binding, query.text);
    for (bool selected : kinds)
        binding += selected ? '1' : '0';
    cursorField(binding, scope ? model::instRef(*scope) : "");
    auto cursor = readCursor(page.cursor, "search", db.snapshotId(), binding, 3);
    if (!cursor)
        return cursor.error();
    if (cancel.stop_requested())
        return cancelled;
    auto occurrences = db.occurrences(cancel);
    if (!occurrences)
        return occurrences.error();
    const auto &index = **occurrences;
    size_t begin = 0, end = index.items.size();
    if (scope) {
        auto found = std::lower_bound(index.items.begin(), index.items.end(), *scope,
                                      [](const auto &item, const auto &key) { return item.key < key; });
        if (found == index.items.end() || found->key != *scope)
            return Error{ErrorCode::NotFound, "no such search scope"};
        begin = size_t(found - index.items.begin());
        end = found->end;
    }
    auto position = *cursor;
    InstanceDescriptions descriptions(db);
    if (position[0] >= kinds.size() || (!page.cursor.empty() && !kinds[position[0]]))
        return badCursor;
    model::QueryResult<Page<model::ObjectHit>> result;
    auto pageFull = [&] { return result.result.items.size() == size_t(page.limit); };
    auto stopBeforeHit = [&] {
        if (pageFull()) {
            result.result.next = makeCursor("search", db.snapshotId(), binding, position);
            return true;
        }
        return false;
    };
    for (; position[0] < kinds.size(); ++position[0], position[1] = 0, position[2] = 0) {
        auto kind = position[0];
        if (!kinds[kind])
            continue;
        if (kind == 0) {
            const auto &definitions = db.frontend().definitions();
            if (position[1] > definitions.size() || position[2] != 0)
                return badCursor;
            for (; position[1] < definitions.size(); ++position[1]) {
                if (cancel.stop_requested())
                    return cancelled;
                auto id = position[1];
                if (scope) {
                    const auto &used = index.byDefinition[id];
                    auto first = std::lower_bound(used.begin(), used.end(), begin);
                    if (first == used.end() || *first >= end)
                        continue;
                }
                const auto &name = definitions[id].name;
                auto pathText = model::escapeSegment(name);
                if (name.find(query.text) == std::string::npos && pathText.find(query.text) == std::string::npos)
                    continue;
                if (stopBeforeHit()) {
                    if (cancel.stop_requested())
                        return cancelled;
                    return result;
                }
                model::ObjectHit value;
                value.kind = model::HitKind::Definition;
                value.ref = model::defRef(uint32_t(id));
                value.def = value.ref;
                value.name = name;
                value.path = {value.name};
                value.pathText = std::move(pathText);
                result.result.items.push_back(std::move(value));
            }
            continue;
        }
        if (position[1] == 0 && position[2] == 0)
            position[1] = begin;
        if (position[1] < begin || position[1] > end)
            return badCursor;
        for (; position[1] < end; ++position[1], position[2] = 0) {
            auto items = candidates(descriptions, db, index.items[position[1]], kind, cancel);
            if (!items)
                return items.error();
            if (position[2] > items->count)
                return badCursor;
            SearchPathText path(items->instance->pathText, query.text);
            // Only signal local paths borrow this occurrence's pinned facts.
            // Syntax-only prefix reuse keeps no matching state or suffix
            // table. Generated port strings are temporary and must never
            // become this validator's previous input view.
            HierarchyPathValidator signalPaths;
            for (; position[2] < items->count; ++position[2]) {
                if (cancel.stop_requested())
                    return cancelled;
                model::ObjectHit value;
                auto matched = matchingHit(*items, kind, position[2], query.text, path,
                                           signalPaths, pageFull() ? nullptr : &value);
                if (!matched)
                    return matched.error();
                if (*matched) {
                    if (stopBeforeHit()) {
                        if (cancel.stop_requested())
                            return cancelled;
                        return result;
                    }
                    result.result.items.push_back(std::move(value));
                }
            }
        }
    }
    if (cancel.stop_requested())
        return cancelled;
    return result;
}

Result<model::QueryResult<std::vector<std::string>>>
resolvePath(const db::DesignDb &db, std::string_view text, Cancel cancel) {
    auto path = parseHierarchyPath(text);
    if (!path)
        return path.error();
    if (cancel.stop_requested())
        return cancelled;
    const auto &parts = path->segments;
    const auto &tops = db.frontend().tops();
    struct Position { model::InstKey key; model::BodyId body; size_t offset; };
    std::vector<Position> work;
    bool includesTop = false;
    for (size_t i = 0; i < tops.size(); ++i) {
        if (cancel.stop_requested())
            return cancelled;
        if (parts[0].name == tops[i].name && parts[0].indices.empty()) {
            includesTop = true;
            work.push_back({{uint32_t(i)}, tops[i].body, 1});
        }
    }
    if (!includesTop && !path->absolute)
        for (size_t i = 0; i < tops.size(); ++i) {
            if (cancel.stop_requested())
                return cancelled;
            work.push_back({{uint32_t(i)}, tops[i].body, 0});
        }
    // Tuple order is the public numeric reference order, with instance/port/signal
    // ranks. Insertion orders and shared-body identities cannot change the result.
    std::set<std::tuple<model::InstKey, int, size_t>> found;
    std::optional<SlotPathPrefix> slotPaths;
    const BodySkeleton *slotBody = nullptr;
    size_t slotOffset = 0;
    while (!work.empty()) {
        if (cancel.stop_requested())
            return cancelled;
        auto current = std::move(work.back());
        work.pop_back();
        if (current.offset == parts.size()) {
            found.emplace(std::move(current.key), 0, 0);
            continue;
        }
        if (current.body == model::kNoBody) {
            auto at = db.locate(current.key, cancel);
            if (!at)
                return at.error();
            const auto &pins = at->steps.back().slot->blackboxPins;
            for (size_t i = 0; i < pins.size(); ++i) {
                if (cancel.stop_requested())
                    return cancelled;
                if (current.offset + 1 == parts.size() && parts.back().name == pins[i] &&
                    parts.back().indices.empty())
                    found.emplace(current.key, 1, i);
            }
            continue;
        }
        auto body = db.skeleton(current.body, cancel);
        if (!body)
            return body.error();
        if (!slotPaths || slotBody != *body || slotOffset != current.offset) {
            slotPaths.emplace(**body, std::span<const PathSegment>(parts).subspan(current.offset));
            slotBody = *body;
            slotOffset = current.offset;
        }
        auto followed = slotPaths->visit(
            [&](size_t index, size_t count) {
                auto key = current.key;
                key.push_back(uint32_t(index));
                work.push_back({std::move(key), (*body)->slots[index].body, current.offset + count});
            }, cancel);
        if (!followed)
            return followed.error();
        for (size_t i = 0; i < (*body)->ports.size(); ++i) {
            if (cancel.stop_requested())
                return cancelled;
            if (current.offset + 1 == parts.size() &&
                parts.back().name == (*body)->ports[i].name && parts.back().indices.empty())
                found.emplace(current.key, 1, i);
        }
        auto facts = db.connections(current.body, cancel);
        if (!facts)
            return facts.error();
        // All candidate local paths stay pinned until this matcher is destroyed.
        HierarchyPathMatcher signalPaths(std::span<const PathSegment>(parts).subspan(current.offset));
        for (size_t i = 0; i < (*facts)->signals.size(); ++i) {
            if (cancel.stop_requested())
                return cancelled;
            auto local = signalPaths.match((*facts)->signals[i].localPath);
            if (!local)
                return Error{ErrorCode::Internal, "invalid frontend signal path"};
            if (*local)
                found.emplace(current.key, 2, i);
        }
    }
    model::QueryResult<std::vector<std::string>> result;
    for (const auto &[key, kind, index] : found) {
        if (cancel.stop_requested())
            return cancelled;
        result.result.push_back(kind == 0 ? model::instRef(key)
                                : std::string(kind == 1 ? "p:" : "s:") + model::formatInstKey(key) +
                                      ":" + std::to_string(index));
    }
    return result;
}

} // namespace hier::detail
