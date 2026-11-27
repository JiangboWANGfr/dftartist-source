#include "ScenariosInternal.h"
#include "../common/Utf8.h"
#include <string_view>
namespace dft::sequential {
// Unicode scalar UTF-8 only: reject continuation starts, overlong encodings,
// surrogates and values above U+10FFFF before a name can reach JSON/error text.
bool detail::validUtf8(std::string_view text) { return dft::detail::validUtf8(text); }
void detail::validateScenarioName(const std::string &name, std::set<std::string> &names) {
    if (name.empty() || name.size() > 128 || !validUtf8(name) || !names.insert(name).second)
        throw hier::Error{hier::ErrorCode::BadRequest, "Scenario names must be unique valid UTF-8 and contain 1..128 bytes"};
}
}
