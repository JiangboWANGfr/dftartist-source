#include "HierarchyPath.h"
#include <algorithm>
#include <charconv>

namespace hier::detail {
namespace {
bool space(char c) {
    return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v';
}
bool first(char c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_';
}
bool digit(char c) { return c >= '0' && c <= '9'; }

size_t identifierEnd(std::string_view text, size_t start) {
    if (start == text.size() || !first(text[start]))
        return start;
    size_t end = start + 1;
    while (end < text.size() && (first(text[end]) || digit(text[end]) || text[end] == '$'))
        ++end;
    return end;
}

void appendDisplayIndex(std::string &text, int32_t index) {
    text += "[" + std::to_string(index) + "]";
}

struct BuildPath {
    HierarchyPath path;
    void absolute() { path.absolute = true; }
    void segment(std::string_view name) { path.segments.push_back({std::string(name), {}}); }
    void index(int32_t value) { path.segments.back().indices.push_back(value); }
    bool boundary(size_t) { return false; }
};
struct CheckPath {
    void absolute() {}
    void segment(std::string_view) {}
    void index(int32_t) {}
    bool boundary(size_t) { return false; }
};
struct DisplayPath : CheckPath {
    std::vector<std::string> path;
    explicit DisplayPath(std::span<const std::string> prefix) : path(prefix.begin(), prefix.end()) {}
    void segment(std::string_view name) { path.emplace_back(name); }
    void index(int32_t value) { appendDisplayIndex(path.back(), value); }
};
struct RecordSyntaxBoundaries : CheckPath {
    PathSyntaxBoundaries boundaries;
    explicit RecordSyntaxBoundaries(PathSyntaxBoundaries validated = {}) : boundaries(validated) {}
    bool boundary(size_t offset) {
        boundaries.last = offset;
        if (!boundaries.first)
            boundaries.first = offset;
        else if (!boundaries.second)
            boundaries.second = offset;
        return false;
    }
};
struct ValidatedSuffixPath : RecordSyntaxBoundaries {
    const std::string_view text, previous;
    // Borrowed only during the scanner call; the validator publishes afterwards.
    const PathSyntaxBoundaries &previousBoundaries;
    ValidatedSuffixPath(std::string_view input, std::string_view validated,
                        const PathSyntaxBoundaries &validatedBoundaries)
        : text(input), previous(validated), previousBoundaries(validatedBoundaries) {}
    bool suffixAt(size_t offset, size_t previousOffset) {
        if (!previousOffset || text.substr(offset) != previous.substr(previousOffset))
            return false;
        // Equal complete suffix lengths bound the translated offset. Subtract
        // within the old input before adding the distance to the new boundary.
        boundaries.last = offset + (previousBoundaries.last - previousOffset);
        return true;
    }
    bool boundary(size_t offset) {
        const bool first = !boundaries.first;
        const bool second = !first && !boundaries.second;
        RecordSyntaxBoundaries::boundary(offset);
        // Both paths use the same complete grammar before attempting reuse.
        if (first && suffixAt(offset, previousBoundaries.first)) {
            if (previousBoundaries.second)
                boundaries.second = offset + (previousBoundaries.second - previousBoundaries.first);
            return true;
        }
        return second && suffixAt(offset, previousBoundaries.second);
    }
};
struct MatchPath {
    std::span<const PathSegment> expected;
    PathMatchState state;
    explicit MatchPath(std::span<const PathSegment> target) : expected(target) {}
    void absolute() {}
    void finishSegment() {
        if (state.matches && state.segments &&
            (state.segments > expected.size() ||
             state.indices != expected[state.segments - 1].indices.size()))
            state.matches = false;
    }
    void segment(std::string_view name) {
        finishSegment();
        if (state.matches &&
            (state.segments >= expected.size() || name != expected[state.segments].name))
            state.matches = false;
        ++state.segments;
        state.indices = 0;
    }
    void index(int32_t value) {
        if (state.matches &&
            (state.segments > expected.size() ||
             state.indices >= expected[state.segments - 1].indices.size() ||
             value != expected[state.segments - 1].indices[state.indices]))
            state.matches = false;
        ++state.indices;
    }
    bool boundary(size_t) { return false; }
    bool complete() {
        finishSegment();
        return state.matches && state.segments == expected.size();
    }
};
struct RememberPath : MatchPath {
    std::vector<PathMatchPoint> &points;
    RememberPath(std::span<const PathSegment> target, std::vector<PathMatchPoint> &output)
        : MatchPath(target), points(output) {}
    bool boundary(size_t offset) {
        points.push_back({offset, state});
        return false;
    }
};
struct FirstBoundaryPath : MatchPath {
    std::optional<PathMatchPoint> &point;
    FirstBoundaryPath(std::span<const PathSegment> target, std::optional<PathMatchPoint> &output)
        : MatchPath(target), point(output) {}
    bool boundary(size_t offset) {
        if (!point)
            point.emplace(PathMatchPoint{offset, state});
        return false;
    }
};

bool samePrefix(size_t offset, std::string_view previous, std::string_view text) {
    return offset <= text.size() && text.substr(0, offset) == previous.substr(0, offset);
}

size_t sharedPrefixPoints(std::span<const PathMatchPoint> points, std::string_view previous,
                          std::string_view text) {
    const auto same = [&](const auto &point) { return samePrefix(point.offset, previous, text); };
    if (points.empty() || !same(points.front()))
        return 0;
    if (same(points.back()))
        return points.size();
    return size_t(std::partition_point(points.begin(), points.end(), same) - points.begin());
}

Error invalidPath() { return {ErrorCode::BadRequest, "invalid hierarchy path syntax"}; }

void whitespace(std::string_view text, size_t &pos) {
    while (pos < text.size() && space(text[pos]))
        ++pos;
}

template <class Sink> bool readSegments(std::string_view text, size_t pos, Sink &sink) {
    // A reused boundary can precede newly inserted separator whitespace.
    // Full parsing already accepts it; continuation must enter the same grammar.
    whitespace(text, pos);
    while (pos < text.size()) {
        if (text[pos] == '\\') {
            auto start = ++pos;
            while (pos < text.size() && !space(text[pos]))
                ++pos;
            if (pos == start || pos == text.size())
                return false; // Escaped identifiers, even final ones, require a terminator.
            sink.segment(text.substr(start, pos - start));
        } else {
            const auto start = pos;
            pos = identifierEnd(text, start);
            if (pos == start)
                return false;
            sink.segment(text.substr(start, pos - start));
        }
        whitespace(text, pos);
        while (pos < text.size() && text[pos] == '[') {
            ++pos;
            whitespace(text, pos);
            auto start = pos;
            if (pos < text.size() && (text[pos] == '-' || text[pos] == '+'))
                ++pos;
            auto digits = pos;
            while (pos < text.size() && digit(text[pos]))
                ++pos;
            if (pos == digits)
                return false;
            auto number = text.substr(start, pos - start);
            if (number.front() == '+')
                number.remove_prefix(1);
            int32_t index = 0;
            auto [end, ec] = std::from_chars(number.data(), number.data() + number.size(), index);
            if (ec != std::errc{} || end != number.data() + number.size())
                return false;
            whitespace(text, pos);
            if (pos == text.size() || text[pos++] != ']')
                return false;
            sink.index(index);
            whitespace(text, pos);
        }
        if (pos == text.size())
            return true;
        if (text[pos] != '.' && text[pos] != '/')
            return false;
        ++pos;
        whitespace(text, pos);
        if (pos == text.size())
            return false;
        // Only a sink that has validated the entire remaining suffix may
        // complete here. All parsing and semantic matching sinks continue.
        if (sink.boundary(pos))
            return true;
    }
    return false;
}

template <class Sink> bool readPath(std::string_view text, Sink &sink) {
    size_t pos = 0;
    whitespace(text, pos);
    if (pos < text.size() && text[pos] == '/') {
        sink.absolute();
        ++pos;
        whitespace(text, pos);
    }
    return readSegments(text, pos, sink);
}
} // namespace

Result<HierarchyPath> parseHierarchyPath(std::string_view text) {
    BuildPath sink;
    auto result = readPath(text, sink);
    if (!result)
        return invalidPath();
    return std::move(sink.path);
}

Result<std::vector<std::string>>
displayHierarchyPath(std::string_view text, std::span<const std::string> prefix) {
    DisplayPath sink(prefix);
    if (!readPath(text, sink))
        return invalidPath();
    return std::move(sink.path);
}

Result<bool> validateHierarchyPath(std::string_view text) {
    CheckPath sink;
    if (!readPath(text, sink))
        return invalidPath();
    return true;
}

bool HierarchyPathValidator::validate(std::string_view text) noexcept {
    const auto finish = [&](bool valid, const PathSyntaxBoundaries &completed) {
        // No sink can retain these references beyond this synchronous scan.
        previous_ = valid ? text : std::string_view{};
        boundaries_ = valid ? completed : PathSyntaxBoundaries{};
        return valid;
    };
    if (!boundaries_.last) {
        const auto end = identifierEnd(text, 0);
        if (end && end == text.size()) {
            previous_ = {};
            return true;
        }
        // No validated suffix exists yet: only remember complete boundaries.
        RecordSyntaxBoundaries sink;
        return finish(readPath(text, sink), sink.boundaries);
    }
    if (samePrefix(boundaries_.last, previous_, text)) {
        RecordSyntaxBoundaries sink(boundaries_);
        // Even an input ending at the old boundary must pass the scanner;
        // a trailing separator can never become valid through cached state.
        return finish(readSegments(text, boundaries_.last, sink), sink.boundaries);
    }
    ValidatedSuffixPath sink(text, previous_, boundaries_);
    return finish(readPath(text, sink), sink.boundaries);
}

Result<bool> matchesHierarchyPath(std::string_view text, std::span<const PathSegment> expected) {
    auto result = matchHierarchyPathSegments(text, expected);
    if (!result)
        return invalidPath();
    return *result;
}

std::optional<bool> matchHierarchyPathSegments(std::string_view text,
                                              std::span<const PathSegment> expected) {
    MatchPath sink(expected);
    if (!readPath(text, sink))
        return std::nullopt;
    return sink.complete();
}

void HierarchyPathMatcher::resetPrefix() noexcept {
    previous_ = {};
    first_.reset();
    points_.clear();
}

std::optional<bool> HierarchyPathMatcher::match(std::string_view text) try {
    if (!first_) {
        // The same lexical reader as readSegments recognizes this complete
        // ordinary name. Complex syntax still uses the full scanner below.
        const auto end = identifierEnd(text, 0);
        if (end && end == text.size()) {
            MatchPath plain(expected_);
            plain.segment(text);
            previous_ = {};
            return plain.complete();
        }
    }
    const auto finish = [&](bool valid, MatchPath &sink) -> std::optional<bool> {
        if (!valid) {
            resetPrefix();
            return std::nullopt;
        }
        previous_ = text;
        return sink.complete();
    };
    if (!first_ || !samePrefix(first_->offset, previous_, text)) {
        first_.reset();
        points_.clear();
        FirstBoundaryPath sink(expected_, first_);
        // Cold or diverging paths validate every segment, but retain just one
        // inline boundary. The remaining table needs actual prefix reuse.
        return finish(readPath(text, sink), sink);
    }
    const auto keep = sharedPrefixPoints(points_, previous_, text);
    const auto point = keep ? points_[keep - 1] : *first_;
    RememberPath sink(expected_, points_);
    sink.state = point.state;
    points_.resize(keep);
    // Resume the same grammar only after unchanged, fully validated bytes.
    // New boundaries form a suffix, never a duplicate of the inline first.
    return finish(readSegments(text, point.offset, sink), sink);
} catch (...) {
    resetPrefix();
    throw;
}

std::string displaySegment(const PathSegment &segment) {
    auto text = segment.name;
    for (auto index : segment.indices)
        appendDisplayIndex(text, index);
    return text;
}
} // namespace hier::detail
