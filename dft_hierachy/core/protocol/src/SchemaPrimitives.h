#pragma once
#include "SessionContract.h"
#include <initializer_list>

namespace hier::protocol::session::schema {
std::optional<int64_t> integer(const JsonValue &);
bool equalString(const JsonValue &, std::string_view);
bool equalBool(const JsonValue &, bool);
size_t unicodeLength(std::string_view);
struct CharacterRun {
    std::string_view characters;
    size_t minimum;
    size_t maximum;
};
bool pattern(std::string_view, std::initializer_list<CharacterRun>);
bool utcCalendar(std::string_view);
bool unique(const JsonValue::Array &);
} // namespace hier::protocol::session::schema
