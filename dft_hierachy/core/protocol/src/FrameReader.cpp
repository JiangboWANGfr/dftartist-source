#include "SessionContract.h"

#include <utility>

namespace hier::protocol::session {

struct FrameReader::Impl {
    static constexpr size_t capacity = 1024 * 1024;
    std::string pending;
    bool ended = false;
    bool failed = false;
};

FrameReader::FrameReader() : impl_(std::make_unique<Impl>()) {}
FrameReader::~FrameReader() = default;

ReadStep FrameReader::feed(std::span<const std::byte> bytes) {
    auto &s = *impl_;
    if (s.failed)
        return {0, ReadStatus::fault, {}};
    if (s.ended)
        return {0, ReadStatus::need_more, {}};
    size_t consumed = 0;
    for (auto byte : bytes) {
        ++consumed;
        const char c = static_cast<char>(byte);
        if (c == '\n') {
            if (!s.pending.empty() && s.pending.back() == '\r')
                s.pending.pop_back();
            if (s.pending.empty()) {
                s.failed = true;
                return {consumed, ReadStatus::fault, {}};
            }
            return {consumed, ReadStatus::frame, std::exchange(s.pending, {})};
        }
        // At the limit, only a potential CRLF delimiter may be retained.
        if (s.pending.size() > Impl::capacity ||
            (s.pending.size() == Impl::capacity && c != '\r')) {
            s.failed = true;
            s.pending.clear();
            return {consumed, ReadStatus::fault, {}};
        }
        s.pending.push_back(c);
    }
    return {consumed, ReadStatus::need_more, {}};
}

EndStatus FrameReader::finish() {
    auto &s = *impl_;
    s.ended = true;
    s.failed = s.failed || !s.pending.empty();
    s.pending.clear();
    return s.failed ? EndStatus::fault : EndStatus::clean;
}

} // namespace hier::protocol::session
