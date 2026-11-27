#include "hier/db/DesignDb.h"
#include "SourceHash.h"

#include <chrono>
#include <ctime>
#include <iomanip>
#include <sstream>

namespace hier::db {
namespace {

// Unambiguous length-prefixed fields, in a fixed versioned order. Counts delimit
// lists; ordered options retain order; maps and source files are path/name sorted.
class InputEncoding {
  public:
    void field(std::string_view text) {
        hash_.update(std::to_string(text.size())).value();
        hash_.update(":").value();
        hash_.update(text).value();
    }
    std::string finish() const { return hash_.finish().value(); }
    void count(size_t value) { field(std::to_string(value)); }
    void list(const std::vector<std::string> &items) {
        count(items.size());
        for (const auto &item : items)
            field(item);
    }
    void attrs(const std::map<std::string, std::string> &items) {
        count(items.size());
        for (const auto &[key, value] : items) {
            field(key);
            field(value);
        }
    }
  private:
    detail::SourceHash hash_;
};

std::string openedNow() {
    const auto now = std::chrono::system_clock::now();
    const auto seconds = std::chrono::floor<std::chrono::seconds>(now);
    const auto millis =
        std::chrono::duration_cast<std::chrono::milliseconds>(now - seconds).count();
    const auto raw = std::chrono::system_clock::to_time_t(seconds);
    std::tm utc{};
    if (!gmtime_r(&raw, &utc))
        throw std::runtime_error("cannot obtain snapshot UTC time");
    std::ostringstream text;
    text.imbue(std::locale::classic());
    text << std::put_time(&utc, "%Y-%m-%dT%H:%M:%S.") << std::setfill('0') << std::setw(3) << millis
         << 'Z';
    return text.str();
}

} // namespace

void DesignDb::captureMetadata() {
    const auto inputs = frontend_->compilationInputs();
    InputEncoding encoded;
    encoded.field("hier-input-v1");
    encoded.field(inputs.frontendIdentity);
    encoded.list(inputs.arguments);
    encoded.list(inputs.sourceOrder);
    encoded.list(inputs.defines);
    encoded.list(inputs.undefines);
    encoded.list(inputs.explicitTops);
    // Hash the bytes Slang actually read, never re-open input paths here.
    std::map<std::string, std::string> files;
    for (const auto &file : frontend_->sourceFiles())
        files.emplace(file.path, sourceHash(file.text, {}).value());
    encoded.count(files.size());
    for (const auto &[path, hash] : files) {
        encoded.field(path);
        encoded.field(hash);
    }
    encoded.count(inputs.libraryCells.size());
    for (const auto &[name, cell] : inputs.libraryCells) {
        encoded.field(name);
        encoded.field(cell ? "present" : "absent");
        if (!cell)
            continue;
        encoded.attrs(cell->attrs);
        encoded.count(cell->pins.size());
        for (const auto &pin : cell->pins) {
            encoded.field(pin.name);
            encoded.field(std::to_string(static_cast<int>(pin.dir)));
            encoded.field(pin.width ? std::to_string(*pin.width) : "unknown");
            encoded.attrs(pin.attrs);
        }
    }
    inputHash_ = encoded.finish();
    inputHashComplete_ = inputs.complete;
    inferredTops_ = inputs.explicitTops.empty();
    openedAt_ = openedNow();
}

} // namespace hier::db
