// D-REUSE-04 finite-span experiment; handler copied unchanged from the
// historical D-REUSE-03 probe.
#include "SchemaPrimitives.h"
#include "SessionContract.h"
#include <fstream>
#include <iostream>
#include <nlohmann/json.hpp>
#include <rapidjson/memorystream.h>
#include <rapidjson/reader.h>

using namespace hier::protocol::session;
using Json = nlohmann::json;

struct RapidOwned
    : rapidjson::BaseReaderHandler<rapidjson::UTF8<>, RapidOwned> {
  struct Frame {
    JsonValue value;
    std::string key;
  };
  std::vector<Frame> stack;
  JsonValue root{nullptr};
  std::string fault;
  bool add(JsonValue value) {
    if (stack.empty())
      root = std::move(value);
    else if (auto object =
                 std::get_if<JsonValue::Object>(&stack.back().value.value))
      object->emplace(stack.back().key, std::move(value));
    else
      std::get<JsonValue::Array>(stack.back().value.value)
          .push_back(std::move(value));
    return true;
  }
  bool begin(JsonValue value) {
    if (stack.size() == 128) {
      fault = "depth_limit";
      return false;
    }
    stack.push_back({std::move(value), {}});
    return true;
  }
  bool end() {
    auto value = std::move(stack.back().value);
    stack.pop_back();
    return add(std::move(value));
  }
  bool Null() { return add({nullptr}); }
  bool Bool(bool value) { return add({value}); }
  bool RawNumber(const char *value, rapidjson::SizeType size, bool) {
    return add({JsonNumber{std::string(value, size)}});
  }
  bool String(const char *value, rapidjson::SizeType size, bool) {
    return add({std::string(value, size)});
  }
  bool Key(const char *value, rapidjson::SizeType size, bool) {
    auto &frame = stack.back();
    frame.key.assign(value, size);
    if (std::get<JsonValue::Object>(frame.value.value).contains(frame.key)) {
      fault = "duplicate_key";
      return false;
    }
    return true;
  }
  bool StartObject() { return begin({JsonValue::Object{}}); }
  bool StartArray() { return begin({JsonValue::Array{}}); }
  bool EndObject(rapidjson::SizeType) { return end(); }
  bool EndArray(rapidjson::SizeType) { return end(); }
};

struct LohmannSax : nlohmann::json_sax<Json> {
  std::vector<std::string> tokens;
  bool null() override { return true; }
  bool boolean(bool) override { return true; }
  bool number_integer(number_integer_t n) override {
    tokens.push_back("integer:" + std::to_string(n));
    return true;
  }
  bool number_unsigned(number_unsigned_t n) override {
    tokens.push_back("unsigned:" + std::to_string(n));
    return true;
  }
  bool number_float(number_float_t, const string_t &token) override {
    tokens.push_back("float:" + token);
    return true;
  }
  bool string(string_t &) override { return true; }
  bool binary(binary_t &) override { return true; }
  bool start_object(std::size_t) override { return true; }
  bool key(string_t &) override { return true; }
  bool end_object() override { return true; }
  bool start_array(std::size_t) override { return true; }
  bool end_array() override { return true; }
  bool parse_error(std::size_t, const std::string &,
                   const Json::exception &) override {
    return false;
  }
};

Json describe(const JsonValue &value) {
  Json result = {
      {"object", std::holds_alternative<JsonValue::Object>(value.value)}};
  const auto object = std::get_if<JsonValue::Object>(&value.value);
  if (!object)
    return result;
  const auto it = object->find("x");
  if (it == object->end())
    return result;
  if (const auto num = std::get_if<JsonNumber>(&it->second.value)) {
    result["x_token"] = num->token;
    const auto integer = schema::integer(it->second);
    result["x_safe_integer"] = integer ? Json(*integer) : Json(nullptr);
  }
  return result;
}

int main(int argc, char **argv) {
  if (argc != 2)
    return 2;
  std::ifstream file(argv[1]);
  const auto cases = Json::parse(file);
  Json rows = Json::array();
  for (const auto &item : cases) {
    std::string text;
    for (const auto &byte : item.at("bytes"))
      text.push_back(static_cast<char>(byte.get<unsigned>()));
    RapidOwned handler;
    rapidjson::Reader reader;
    rapidjson::MemoryStream stream(text.data(), text.size());
    const auto parsed =
        reader.Parse<rapidjson::kParseValidateEncodingFlag |
                     rapidjson::kParseNumbersAsStringsFlag |
                     rapidjson::kParseIterativeFlag>(stream, handler);
    const bool prefixOk =
        parsed && std::holds_alternative<JsonValue::Object>(handler.root.value);
    const auto nul = text.find('\0');
    Json row = {
        {"name", item.at("name")},
        {"bytes", text.size()},
        {"consumed", stream.Tell()},
        {"prefix_accepted", prefixOk},
        {"full_span_accepted", prefixOk && stream.Tell() == text.size()},
        {"nul_guard_accepted",
         prefixOk && nul == std::string::npos && stream.Tell() == text.size()},
        {"reader_code", static_cast<int>(parsed.Code())}};
    const auto decoded = decodeFrame(text);
    row["current_accepted"] =
        std::holds_alternative<JsonValue::Object>(decoded);
    // This experiment does not implement production UTF-8 priority or error
    // offsets.
    rows.push_back(std::move(row));
  }
  std::cout << rows.dump(2) << '\n';
}
