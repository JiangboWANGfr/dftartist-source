#pragma once
#include "hier/model/Result.h"
#include <cstdint>
#include <optional>
#include <span>
#include <string_view>

namespace hier::detail {

struct PathSegment {
    std::string name;
    std::vector<int32_t> indices;
    bool operator==(const PathSegment &) const = default;
};
struct HierarchyPath {
    bool absolute = false;
    std::vector<PathSegment> segments;
};
Result<HierarchyPath> parseHierarchyPath(std::string_view text);
// Own the display path directly with the same complete grammar and index
// formatting. The prefix is copied unchanged; the absolute marker is ignored.
Result<std::vector<std::string>>
displayHierarchyPath(std::string_view text, std::span<const std::string> prefix = {});
// The same grammar, without constructing strings, segments or index vectors.
Result<bool> validateHierarchyPath(std::string_view text);
// Compare segments with the same complete grammar, without building a candidate
// path. Like the original local-path consumer, the absolute marker is ignored.
Result<bool> matchesHierarchyPath(std::string_view text, std::span<const PathSegment> expected);
// Lightweight synchronous matching: no value means malformed syntax; false is
// a valid nonmatch. Uses the same complete scanner as the Result interfaces.
std::optional<bool> matchHierarchyPathSegments(std::string_view text,
                                              std::span<const PathSegment> expected);

// The fixed syntax continuation points; never a variable-depth path table.
struct PathSyntaxBoundaries {
    size_t first = 0, second = 0, last = 0;
};

// Complete syntax validation of an immutable batch, without matching state or
// a boundary table. The previous input must outlive the next validate call.
class HierarchyPathValidator {
  public:
    HierarchyPathValidator() = default;
    HierarchyPathValidator(const HierarchyPathValidator &) = delete;
    HierarchyPathValidator &operator=(const HierarchyPathValidator &) = delete;
    HierarchyPathValidator(HierarchyPathValidator &&) = delete;
    HierarchyPathValidator &operator=(HierarchyPathValidator &&) = delete;
    bool validate(std::string_view text) noexcept;

  private:
    std::string_view previous_;
    PathSyntaxBoundaries boundaries_;
};

struct PathMatchState {
    size_t segments = 0, indices = 0;
    bool matches = true;
};
struct PathMatchPoint {
    size_t offset;
    PathMatchState state;
};
// Synchronous matching of an immutable batch against one fixed target. Target
// segments and each previously supplied text must outlive the next match call.
// Only complete, validated segment boundaries can be reused; no facts escape.
class HierarchyPathMatcher {
  public:
    explicit HierarchyPathMatcher(std::span<const PathSegment> expected) : expected_(expected) {}
    HierarchyPathMatcher(const HierarchyPathMatcher &) = delete;
    HierarchyPathMatcher &operator=(const HierarchyPathMatcher &) = delete;
    HierarchyPathMatcher(HierarchyPathMatcher &&) = delete;
    HierarchyPathMatcher &operator=(HierarchyPathMatcher &&) = delete;
    std::optional<bool> match(std::string_view text);

  private:
    const std::span<const PathSegment> expected_;
    std::string_view previous_;
    std::optional<PathMatchPoint> first_;
    // Boundaries after first_; populated only after that prefix is reused.
    std::vector<PathMatchPoint> points_;
    void resetPrefix() noexcept;
};
std::string displaySegment(const PathSegment &segment);

} // namespace hier::detail
