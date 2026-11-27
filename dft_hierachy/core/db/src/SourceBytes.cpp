#include "hier/db/SourceIndex.h"
#include "SourceHash.h"
#include "SourceFileHash.h"
#include "SourceUtf8.h"
#include <array>
#include <algorithm>
#include <cstdint>
#include <cstring>
#include <fstream>

namespace hier::db {
Result<std::string> sourceHash(std::string_view bytes, Cancel cancel) {
    detail::SourceHash hash;
    auto updated = hash.update(bytes, cancel);
    if (!updated)
        return updated.error();
    return hash.finish(cancel);
}
namespace {
// One read/error/cancellation boundary shared by owning text and digest readers.
// The callback consumes the view before the same buffer is reused.
template <class Consume>
Result<bool> readSourceChunks(const SourceFile &file, Cancel cancel, Consume consume) {
    if (cancel.stop_requested())
        return Error{ErrorCode::Cancelled, "source read cancelled"};
    std::ifstream stream(file.path, std::ios::binary);
    if (!stream)
        return Error{ErrorCode::NotFound, "cannot read source file: " + file.path};
    std::array<char, 65536> buffer;
    while (stream) {
        stream.read(buffer.data(), std::streamsize(buffer.size()));
        consume(std::string_view(buffer.data(), size_t(stream.gcount())));
        if (cancel.stop_requested())
            return Error{ErrorCode::Cancelled, "source read cancelled"};
    }
    if (!stream.eof() || stream.bad())
        return Error{ErrorCode::NotFound, "failed reading source file: " + file.path};
    return true;
}
} // namespace
Result<std::string> readSourceBytes(const SourceFile &file, Cancel cancel) {
    std::string bytes;
    auto read = readSourceChunks(file, cancel, [&](std::string_view chunk) { bytes.append(chunk); });
    if (!read)
        return read.error();
    return bytes;
}
Result<std::string> hashSourceFile(const SourceFile &file, Cancel cancel) {
    detail::SourceHash hash;
    auto read = readSourceChunks(file, cancel, [&](std::string_view chunk) {
        // Keep the original file-read cancellation boundary. SHA work within
        // one read block is bounded; a cancelled reader discards this state.
        hash.update(chunk).value();
    });
    if (!read)
        return read.error();
    return hash.finish(cancel);
}
bool sourceUtf8(std::string_view bytes, Cancel cancel) {
    size_t i = 0;
    while (i < bytes.size()) {
        if (cancel.stop_requested())
            return false;
        if (static_cast<unsigned char>(bytes[i]) < 0x80) {
            // Bound ASCII work between cancellation checks. memcpy avoids both
            // alignment and aliasing assumptions; the high-bit mask is endian
            // independent. A non-ASCII word falls back to the same decoder.
            const auto stop = i + std::min(size_t(4096), bytes.size() - i);
            while (stop - i >= sizeof(uint64_t)) {
                uint64_t word;
                std::memcpy(&word, bytes.data() + i, sizeof(word));
                if (word & 0x8080808080808080ULL)
                    break;
                i += sizeof(word);
            }
            while (i < stop && static_cast<unsigned char>(bytes[i]) < 0x80)
                ++i;
            if (i == stop)
                continue;
        }
        if (!detail::consumeSourceUtf8(bytes, i))
            return false;
    }
    return true;
}
} // namespace hier::db
