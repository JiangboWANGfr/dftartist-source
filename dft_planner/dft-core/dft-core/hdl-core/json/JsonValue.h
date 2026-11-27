#pragma once
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace hdl::json {

// Minimal JSON value + parser for incoming NDJSON requests.
struct Value {
    enum class Type { Null, Bool, Int, Double, Str, Array, Object };
    Type type = Type::Null;
    bool b = false;
    long long i = 0;
    double d = 0;
    std::string s;
    std::vector<Value> arr;
    std::vector<std::pair<std::string, Value>> obj;  // insertion order preserved

    bool isNull() const { return type == Type::Null; }
    bool isStr() const { return type == Type::Str; }

    // Object lookup (nullptr if absent / not an object).
    const Value* find(const std::string& key) const {
        if (type != Type::Object) return nullptr;
        for (auto& [k, v] : obj)
            if (k == key) return &v;
        return nullptr;
    }
    // Convenience: string field or "".
    std::string str(const std::string& key) const {
        const Value* v = find(key);
        return (v && v->type == Type::Str) ? v->s : std::string();
    }
};

class ParseError : public std::runtime_error {
public:
    explicit ParseError(const std::string& m) : std::runtime_error(m) {}
};

namespace detail {

class Parser {
public:
    explicit Parser(const std::string& text) : t_(text) {}

    Value parse() {
        Value v = parseValue();
        skipWs();
        if (pos_ != t_.size()) throw ParseError("trailing content");
        return v;
    }

private:
    const std::string& t_;
    size_t pos_ = 0;

    void skipWs() {
        while (pos_ < t_.size()) {
            char c = t_[pos_];
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r')
                ++pos_;
            else
                break;
        }
    }
    char peek() {
        if (pos_ >= t_.size()) throw ParseError("unexpected end");
        return t_[pos_];
    }
    char next() {
        if (pos_ >= t_.size()) throw ParseError("unexpected end");
        return t_[pos_++];
    }
    void expect(char c) {
        if (next() != c) throw ParseError(std::string("expected '") + c + "'");
    }

    Value parseValue() {
        skipWs();
        char c = peek();
        switch (c) {
            case '{': return parseObject();
            case '[': return parseArray();
            case '"': {
                Value v;
                v.type = Value::Type::Str;
                v.s = parseString();
                return v;
            }
            case 't': case 'f': return parseBool();
            case 'n': return parseNull();
            default: return parseNumber();
        }
    }

    Value parseObject() {
        Value v;
        v.type = Value::Type::Object;
        expect('{');
        skipWs();
        if (peek() == '}') { ++pos_; return v; }
        while (true) {
            skipWs();
            std::string key = parseString();
            skipWs();
            expect(':');
            Value val = parseValue();
            v.obj.emplace_back(std::move(key), std::move(val));
            skipWs();
            char c = next();
            if (c == '}') break;
            if (c != ',') throw ParseError("expected ',' or '}'");
        }
        return v;
    }

    Value parseArray() {
        Value v;
        v.type = Value::Type::Array;
        expect('[');
        skipWs();
        if (peek() == ']') { ++pos_; return v; }
        while (true) {
            v.arr.push_back(parseValue());
            skipWs();
            char c = next();
            if (c == ']') break;
            if (c != ',') throw ParseError("expected ',' or ']'");
        }
        return v;
    }

    std::string parseString() {
        skipWs();
        expect('"');
        std::string out;
        while (true) {
            char c = next();
            if (c == '"') break;
            if (c == '\\') {
                char e = next();
                switch (e) {
                    case '"': out += '"'; break;
                    case '\\': out += '\\'; break;
                    case '/': out += '/'; break;
                    case 'b': out += '\b'; break;
                    case 'f': out += '\f'; break;
                    case 'n': out += '\n'; break;
                    case 'r': out += '\r'; break;
                    case 't': out += '\t'; break;
                    case 'u': out += decodeUnicode(); break;
                    default: throw ParseError("bad escape");
                }
            } else {
                out += c;
            }
        }
        return out;
    }

    std::string decodeUnicode() {
        unsigned cp = 0;
        for (int k = 0; k < 4; ++k) {
            char h = next();
            cp <<= 4;
            if (h >= '0' && h <= '9') cp |= unsigned(h - '0');
            else if (h >= 'a' && h <= 'f') cp |= unsigned(h - 'a' + 10);
            else if (h >= 'A' && h <= 'F') cp |= unsigned(h - 'A' + 10);
            else throw ParseError("bad \\u");
        }
        std::string out;  // encode BMP code point as UTF-8
        if (cp < 0x80) {
            out += char(cp);
        } else if (cp < 0x800) {
            out += char(0xC0 | (cp >> 6));
            out += char(0x80 | (cp & 0x3F));
        } else {
            out += char(0xE0 | (cp >> 12));
            out += char(0x80 | ((cp >> 6) & 0x3F));
            out += char(0x80 | (cp & 0x3F));
        }
        return out;
    }

    Value parseBool() {
        Value v;
        v.type = Value::Type::Bool;
        if (t_.compare(pos_, 4, "true") == 0) { pos_ += 4; v.b = true; }
        else if (t_.compare(pos_, 5, "false") == 0) { pos_ += 5; v.b = false; }
        else throw ParseError("bad literal");
        return v;
    }
    Value parseNull() {
        if (t_.compare(pos_, 4, "null") != 0) throw ParseError("bad literal");
        pos_ += 4;
        return Value{};
    }
    Value parseNumber() {
        size_t start = pos_;
        bool isDouble = false;
        if (peek() == '-') ++pos_;
        while (pos_ < t_.size()) {
            char c = t_[pos_];
            if (c >= '0' && c <= '9') { ++pos_; }
            else if (c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') { isDouble = true; ++pos_; }
            else break;
        }
        std::string num = t_.substr(start, pos_ - start);
        if (num.empty()) throw ParseError("bad number");
        Value v;
        if (isDouble) { v.type = Value::Type::Double; v.d = std::stod(num); }
        else { v.type = Value::Type::Int; v.i = std::stoll(num); }
        return v;
    }
};

}  // namespace detail

inline Value parse(const std::string& text) { return detail::Parser(text).parse(); }

}  // namespace hdl::json
