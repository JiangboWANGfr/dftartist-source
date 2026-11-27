#include "SchemaPrimitives.h"

#include <algorithm>

namespace hier::protocol::session::schema {
namespace {
struct Decimal {
    bool negative = false;
    std::string digits;
    int64_t scale = 0;
};

// The strict decoder has already verified the grammar. Work with decimal digits
// so 9007199254740991.1 cannot round down and masquerade as a valid wire integer.
Decimal decimal(std::string_view token) {
    Decimal d;
    if (token.front() == '-') {
        d.negative = true;
        token.remove_prefix(1);
    }
    bool fraction = false;
    size_t pos = 0;
    while (pos < token.size() && token[pos] != 'e' && token[pos] != 'E') {
        if (token[pos] == '.')
            fraction = true;
        else {
            d.digits += token[pos];
            if (fraction)
                --d.scale;
        }
        ++pos;
    }
    if (pos < token.size()) {
        ++pos;
        bool negative = false;
        if (token[pos] == '-' || token[pos] == '+')
            negative = token[pos++] == '-';
        int64_t exponent = 0;
        // A frame is <=1 MiB; a larger exponent cannot be offset by its mantissa.
        for (; pos < token.size(); ++pos)
            exponent = std::min<int64_t>(2000000, exponent * 10 + (token[pos] - '0'));
        d.scale += negative ? -exponent : exponent;
    }
    const auto first = d.digits.find_first_not_of('0');
    if (first == std::string::npos)
        return {false, "0", 0};
    d.digits.erase(0, first);
    while (d.digits.back() == '0') {
        d.digits.pop_back();
        ++d.scale;
    }
    return d;
}

bool equal(const JsonValue &a, const JsonValue &b) {
    if (a.value.index() != b.value.index())
        return false;
    if (const auto s = std::get_if<std::string>(&a.value))
        return *s == std::get<std::string>(b.value);
    if (const auto p = std::get_if<bool>(&a.value))
        return *p == std::get<bool>(b.value);
    if (const auto n = std::get_if<JsonNumber>(&a.value)) {
        const auto x = decimal(n->token), y = decimal(std::get<JsonNumber>(b.value).token);
        return x.negative == y.negative && x.digits == y.digits && x.scale == y.scale;
    }
    if (const auto array = std::get_if<JsonValue::Array>(&a.value)) {
        const auto &other = std::get<JsonValue::Array>(b.value);
        return array->size() == other.size() &&
               std::equal(array->begin(), array->end(), other.begin(), equal);
    }
    if (const auto object = std::get_if<JsonValue::Object>(&a.value)) {
        const auto &other = std::get<JsonValue::Object>(b.value);
        if (object->size() != other.size())
            return false;
        auto next = other.begin();
        for (const auto &[key, value] : *object) {
            if (key != next->first || !equal(value, next->second))
                return false;
            ++next;
        }
    }
    return true;
}
} // namespace

std::optional<int64_t> integer(const JsonValue &v) {
    const auto number = std::get_if<JsonNumber>(&v.value);
    if (!number)
        return {};
    const auto d = decimal(number->token);
    if (d.scale < 0 || d.scale > 16 || d.digits.size() > 16 ||
        d.digits.size() + static_cast<size_t>(d.scale) > 16)
        return {};
    int64_t result = 0;
    for (const char c : d.digits)
        result = result * 10 + (c - '0');
    for (int64_t i = 0; i < d.scale; ++i)
        result *= 10;
    if (result > 9007199254740991LL)
        return {};
    return d.negative ? -result : result;
}

bool equalString(const JsonValue &v, std::string_view s) {
    const auto text = std::get_if<std::string>(&v.value);
    return text && *text == s;
}
bool equalBool(const JsonValue &v, bool b) {
    const auto value = std::get_if<bool>(&v.value);
    return value && *value == b;
}
size_t unicodeLength(std::string_view text) {
    size_t result = 0;
    for (char c : text)
        if ((static_cast<unsigned char>(c) & 0xc0) != 0x80)
            ++result;
    return result;
}
bool pattern(std::string_view text, std::initializer_list<CharacterRun> runs) {
    // The generator rejects ambiguous repetition and unsupported regex syntax.
    // Each byte is consumed once; matching allocates no per-session regex state.
    size_t at = 0;
    for (const auto &run : runs) {
        size_t count = 0;
        while (at < text.size() && count < run.maximum &&
               run.characters.find(text[at]) != std::string_view::npos) {
            ++at;
            ++count;
        }
        if (count < run.minimum)
            return false;
    }
    return at == text.size();
}
bool utcCalendar(std::string_view text) {
    if (text.size() != 24)
        return false;
    auto number = [&](size_t start, size_t count) {
        unsigned n = 0;
        for (size_t i = start; i < start + count; ++i) {
            if (text[i] < '0' || text[i] > '9')
                return 10000u;
            n = n * 10 + static_cast<unsigned>(text[i] - '0');
        }
        return n;
    };
    const auto y = number(0, 4), m = number(5, 2), day = number(8, 2);
    if (y == 0 || y > 9999 || m < 1 || m > 12 || day < 1)
        return false;
    constexpr unsigned lengths[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    const bool leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    return day <= lengths[m - 1] + (m == 2 && leap ? 1u : 0u) && number(11, 2) < 24 &&
           number(14, 2) < 60 && number(17, 2) < 60;
}
bool unique(const JsonValue::Array &items) {
    for (size_t i = 0; i < items.size(); ++i)
        for (size_t j = 0; j < i; ++j)
            if (equal(items[i], items[j]))
                return false;
    return true;
}
} // namespace hier::protocol::session::schema
