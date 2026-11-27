#pragma once
#include <cstddef>
#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <string_view>
#include <variant>
#include <vector>
namespace hier::protocol {
// Owned JSON values; retain number spelling until exact integer validation.
struct JsonNumber { std::string token; };
struct JsonValue {
    using Array=std::vector<JsonValue>;
    using Object=std::map<std::string,JsonValue,std::less<>>;
    std::variant<std::nullptr_t,bool,JsonNumber,std::string,Array,Object> value;
};
enum class JsonDecodeFaultCode { invalid_utf8,invalid_json,duplicate_key,depth_limit,non_object };
struct JsonDecodeFault { JsonDecodeFaultCode code;size_t byteOffset; };
using JsonDecodeResult=std::variant<JsonValue::Object,JsonDecodeFault>;
// Strict UTF8/object JSON, duplicate-key and depth checks. Callers bound input
// bytes and own cancellation/IO policy. No views into the input are retained.
JsonDecodeResult decodeJsonObject(std::string_view);
// Exact integral value in +/- (2^53-1), or nullopt. Also validates manually
// constructed number tokens (at most 1 MiB), never rounds through double.
std::optional<int64_t> jsonSafeInteger(const JsonValue &);
}
