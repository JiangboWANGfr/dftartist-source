#pragma once
#include <algorithm>
#include <string>
#include <string_view>

namespace hier::detail {
// One occurrence's literal path predicate. The two views borrow the current
// instance description and query text, both stable until this object is gone.
// Only a boundary window owns bytes; returned ObjectHits never borrow it.
class SearchPathText {
  public:
    SearchPathText(std::string_view parent, std::string_view text)
        : parent_(parent), text_(text), parentMatches_(parent.find(text) != parent.npos),
          hasDot_(text.find('.') != text.npos) {}

    bool matches(std::string_view local, bool appended) {
        if (parentMatches_)
            return true;
        // Anonymous objects retain the unextended instance path.
        if (!appended)
            return false;
        if (local.find(text_) != local.npos)
            return true;
        if (!hasDot_ || (text_.size() > parent_.size() &&
                        text_.size() - parent_.size() - 1 > local.size()))
            return false;
        // A remaining match must cross the inserted dot: at most m-1 bytes
        // before it and m-1 after it can belong to a length-m match. A match
        // ending/starting at the dot is included, without rescanning the parent.
        if (!boundaryPrefix_) {
            const auto tail = std::min(parent_.size(), text_.size() - 1);
            boundary_.assign(parent_.substr(parent_.size() - tail));
            boundary_ += '.';
            boundaryPrefix_ = boundary_.size();
        }
        boundary_.resize(boundaryPrefix_);
        boundary_.append(local.substr(0, text_.size() - 1));
        return boundary_.find(text_) != boundary_.npos;
    }

  private:
    std::string_view parent_, text_;
    bool parentMatches_, hasDot_;
    std::string boundary_;
    size_t boundaryPrefix_ = 0;
};
} // namespace hier::detail
