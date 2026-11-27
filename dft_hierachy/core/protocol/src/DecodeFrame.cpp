#include "SessionContract.h"
#include "SchemaPrimitives.h"

namespace hier::protocol::session {
namespace {

// Check the complete byte string before parsing, including unknown fields and
// bytes after a JSON syntax error. No replacement characters are introduced.
std::optional<size_t> invalidUtf8(std::string_view bytes) {
    for (size_t i = 0; i < bytes.size();) {
        const auto first = static_cast<unsigned char>(bytes[i]);
        if (first < 0x80) {
            ++i;
            continue;
        }
        size_t length = 0;
        if (first >= 0xc2 && first <= 0xdf)
            length = 2;
        else if (first >= 0xe0 && first <= 0xef)
            length = 3;
        else if (first >= 0xf0 && first <= 0xf4)
            length = 4;
        else
            return i;
        if (bytes.size() - i < length)
            return i;
        for (size_t j = 1; j < length; ++j) {
            const auto next = static_cast<unsigned char>(bytes[i + j]);
            if (next < 0x80 || next > 0xbf)
                return i;
        }
        const auto second = static_cast<unsigned char>(bytes[i + 1]);
        if ((first == 0xe0 && second < 0xa0) || (first == 0xed && second >= 0xa0) ||
            (first == 0xf0 && second < 0x90) || (first == 0xf4 && second >= 0x90))
            return i;
        i += length;
    }
    return {};
}

void appendUtf8(std::string &text, uint32_t cp) {
    if (cp < 0x80)
        text.push_back(static_cast<char>(cp));
    else if (cp < 0x800) {
        text.push_back(static_cast<char>(0xc0 | (cp >> 6)));
        text.push_back(static_cast<char>(0x80 | (cp & 0x3f)));
    } else if (cp < 0x10000) {
        text.push_back(static_cast<char>(0xe0 | (cp >> 12)));
        text.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3f)));
        text.push_back(static_cast<char>(0x80 | (cp & 0x3f)));
    } else {
        text.push_back(static_cast<char>(0xf0 | (cp >> 18)));
        text.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3f)));
        text.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3f)));
        text.push_back(static_cast<char>(0x80 | (cp & 0x3f)));
    }
}

class Parser {
  public:
    explicit Parser(std::string_view bytes) : bytes_(bytes) {}
    JsonValue::Object parse() {
        whitespace();
        const size_t start = at_;
        auto root = value(0);
        whitespace();
        if (at_ != bytes_.size())
            fail();
        if (auto object = std::get_if<JsonValue::Object>(&root.value))
            return std::move(*object);
        throw DecodeFault{DecodeFaultCode::non_object, start};
    }

  private:
    std::string_view bytes_;
    size_t at_ = 0;

    [[noreturn]] void fail() const { throw DecodeFault{DecodeFaultCode::invalid_json, at_}; }
    char peek() const { return at_ < bytes_.size() ? bytes_[at_] : '\0'; }
    bool take(char c) {
        if (at_ < bytes_.size() && bytes_[at_] == c) {
            ++at_;
            return true;
        }
        return false;
    }
    void expect(char c) {
        if (!take(c))
            fail();
    }
    void whitespace() {
        while (at_ < bytes_.size()) {
            const char c = bytes_[at_];
            if (c != ' ' && c != '\r' && c != '\n' && c != '\t')
                break;
            ++at_;
        }
    }
    static bool digit(char c) { return c >= '0' && c <= '9'; }
    uint32_t hex4() {
        uint32_t result = 0;
        for (unsigned i = 0; i < 4; ++i) {
            const char c = peek();
            uint32_t n = 0;
            if (c >= '0' && c <= '9')
                n = static_cast<uint32_t>(c - '0');
            else if (c >= 'a' && c <= 'f')
                n = static_cast<uint32_t>(c - 'a') + 10;
            else if (c >= 'A' && c <= 'F')
                n = static_cast<uint32_t>(c - 'A') + 10;
            else
                fail();
            result = (result << 4) | n;
            ++at_;
        }
        return result;
    }
    std::string string() {
        expect('"');
        std::string result;
        while (at_ < bytes_.size()) {
            const char c = peek();
            if (c == '"') {
                ++at_;
                return result;
            }
            if (static_cast<unsigned char>(c) < 0x20)
                fail();
            ++at_;
            if (c != '\\') {
                result.push_back(c);
                continue;
            }
            const char escaped = peek();
            if (at_ == bytes_.size())
                fail();
            ++at_;
            switch (escaped) {
            case '"':
            case '\\':
            case '/':
                result.push_back(escaped);
                break;
            case 'b':
                result.push_back('\b');
                break;
            case 'f':
                result.push_back('\f');
                break;
            case 'n':
                result.push_back('\n');
                break;
            case 'r':
                result.push_back('\r');
                break;
            case 't':
                result.push_back('\t');
                break;
            case 'u': {
                uint32_t cp = hex4();
                if (cp >= 0xd800 && cp <= 0xdbff) {
                    expect('\\');
                    expect('u');
                    const uint32_t low = hex4();
                    if (low < 0xdc00 || low > 0xdfff)
                        fail();
                    cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
                } else if (cp >= 0xdc00 && cp <= 0xdfff)
                    fail();
                appendUtf8(result, cp);
                break;
            }
            default:
                --at_;
                fail();
            }
        }
        fail();
    }
    JsonNumber number() {
        const size_t begin = at_;
        take('-');
        if (!take('0')) {
            if (peek() < '1' || peek() > '9')
                fail();
            do {
                ++at_;
            } while (digit(peek()));
        }
        if (take('.')) {
            if (!digit(peek()))
                fail();
            do {
                ++at_;
            } while (digit(peek()));
        }
        if (take('e') || take('E')) {
            if (!take('+'))
                take('-');
            if (!digit(peek()))
                fail();
            do {
                ++at_;
            } while (digit(peek()));
        }
        return {std::string(bytes_.substr(begin, at_ - begin))};
    }
    void literal(std::string_view expected) {
        for (char c : expected)
            expect(c);
    }
    JsonValue value(size_t depth) {
        whitespace();
        const char c = peek();
        if ((c == '{' || c == '[') && depth == 128)
            throw DecodeFault{DecodeFaultCode::depth_limit, at_};
        if (take('{')) {
            JsonValue::Object object;
            whitespace();
            if (take('}'))
                return {std::move(object)};
            do {
                whitespace();
                const size_t keyStart = at_;
                auto key = string();
                if (object.contains(key))
                    throw DecodeFault{DecodeFaultCode::duplicate_key, keyStart};
                whitespace();
                expect(':');
                auto item = value(depth + 1);
                object.emplace(std::move(key), std::move(item));
                whitespace();
                if (take('}'))
                    return {std::move(object)};
                expect(',');
            } while (true);
        }
        if (take('[')) {
            JsonValue::Array array;
            whitespace();
            if (take(']'))
                return {std::move(array)};
            do {
                array.push_back(value(depth + 1));
                whitespace();
                if (take(']'))
                    return {std::move(array)};
                expect(',');
            } while (true);
        }
        if (c == '"')
            return {string()};
        if (c == '-' || digit(c))
            return {number()};
        if (c == 't') {
            literal("true");
            return {true};
        }
        if (c == 'f') {
            literal("false");
            return {false};
        }
        if (c == 'n') {
            literal("null");
            return {nullptr};
        }
        fail();
    }
};

} // namespace

DecodeResult decodeFrame(std::string_view bytes) {
    if (const auto invalid = invalidUtf8(bytes))
        return DecodeFault{DecodeFaultCode::invalid_utf8, *invalid};
    try {
        return Parser(bytes).parse();
    } catch (const DecodeFault &fault) {
        return fault;
    }
}

} // namespace hier::protocol::session

namespace hier::protocol {
JsonDecodeResult decodeJsonObject(std::string_view bytes) { return session::decodeFrame(bytes); }
std::optional<int64_t> jsonSafeInteger(const JsonValue &value) {
    const auto *number=std::get_if<JsonNumber>(&value.value);
    if(!number||number->token.empty()||number->token.size()>1048576)return {};
    auto decoded=decodeJsonObject("{\"n\":"+number->token+"}");
    const auto *object=std::get_if<JsonValue::Object>(&decoded);
    if(!object||object->size()!=1||!object->contains("n")||!std::holds_alternative<JsonNumber>(object->at("n").value))return {};
    if(std::get<JsonNumber>(object->at("n").value).token!=number->token)return {};
    return session::schema::integer(object->at("n"));
}
}
