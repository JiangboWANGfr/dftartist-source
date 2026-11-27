// D-REUSE-04 research only. This is not a production adapter or an independent
// B test.
#include "SchemaPrimitives.h"
#include "WireSchema.h"
#include <fstream>
#include <iostream>
#include <jsoncons/json.hpp>
#include <jsoncons_ext/jsonschema/jsonschema.hpp>
#include <map>
#include <nlohmann/json.hpp>

using namespace hier::protocol::session;
using J = jsoncons::json;
using Out = nlohmann::json;
namespace js = jsoncons::jsonschema;

J exactNumber(const std::string &token) {
  const auto exact = schema::integer(JsonValue{JsonNumber{token}});
  return exact
             ? J(*exact)
             : J::parse(token, jsoncons::json_options{}.lossless_number(true));
}

J normalize(J value) {
  if (value.is_number()) {
    // A tagged numeric string is a raw JSON number, unlike an ordinary JSON
    // string.
    const auto token =
        value.is_string() ? value.as<std::string>() : value.to_string();
    return exactNumber(token);
  }
  if (value.is_array()) {
    for (auto &item : value.array_range())
      item = normalize(std::move(item));
  } else if (value.is_object()) {
    for (auto &item : value.object_range())
      item.value() = normalize(std::move(item.value()));
  }
  return value;
}

J convert(const JsonValue &value) {
  if (std::holds_alternative<std::nullptr_t>(value.value))
    return J::null();
  if (const auto p = std::get_if<bool>(&value.value))
    return J(*p);
  if (const auto p = std::get_if<std::string>(&value.value))
    return J(*p);
  if (const auto p = std::get_if<JsonNumber>(&value.value))
    return exactNumber(p->token);
  if (const auto p = std::get_if<JsonValue::Array>(&value.value)) {
    J result = J::array();
    for (const auto &item : *p)
      result.push_back(convert(item));
    return result;
  }
  J result = J::object();
  for (const auto &[key, item] : std::get<JsonValue::Object>(value.value))
    result[key] = convert(item);
  return result;
}

Out identity(const J &value) {
  Out result = {{"number", value.is_number()},
                {"string", value.is_string()},
                {"tag", static_cast<int>(value.tag())}};
  if (value.is_string()) {
    const auto text = value.as<std::string>();
    result["string_bytes"] =
        std::vector<unsigned char>(text.begin(), text.end());
  }
  if (value.is_object()) {
    result["keys"] = Out::array();
    for (const auto &item : value.object_range()) {
      result["keys"].push_back(
          std::vector<unsigned char>(item.key().begin(), item.key().end()));
    }
    for (const auto *key : {"inst", "extension"}) {
      if (value.contains(key))
        result[key] = identity(value.at(key));
    }
  }
  return result;
}

int main(int argc, char **argv) {
  if (argc != 3)
    return 2;
  std::ifstream schemaFile(argv[1]);
  const auto document = J::parse(schemaFile);
  std::ifstream casesFile(argv[2]);
  const auto cases = Out::parse(casesFile);
  std::map<std::string, js::json_schema<J>> validators;
  Out rows = Out::array();
  for (const auto &item : cases) {
    const auto name = item.at("definition").get<std::string>();
    if (!validators.contains(name)) {
      J entry;
      entry["$schema"] = "https://json-schema.org/draft/2020-12/schema";
      entry["$defs"] = document.at("$defs");
      entry["$ref"] = "#/$defs/" + name;
      validators.emplace(
          name,
          js::make_json_schema(
              entry, js::evaluation_options{}.require_format_validation(true)));
    }
    std::string bytes;
    for (const auto &byte : item.at("bytes"))
      bytes.push_back(static_cast<char>(byte.get<unsigned>()));
    Out row = {{"name", item.at("name")},
               {"group", item.at("group")},
               {"expected", item.at("expected")}};
    // The finite carrier {"value": <definition input>} lets the same raw bytes
    // exercise scalar/array definitions through the production object decoder.
    const auto decoded = decodeFrame(bytes);
    if (const auto object = std::get_if<JsonValue::Object>(&decoded)) {
      const auto &value = object->at("value");
      row["current"] = {{"decoded", true},
                        {"accepted", validateDefinition(name, value)}};
      try {
        const auto candidate = convert(value);
        row["strict_then_candidate"] = {
            {"decoded", true},
            {"accepted", validators.at(name).is_valid(candidate)}};
        if (item.at("group") != "B_original_structural")
          row["strict_then_candidate"]["identity"] = identity(candidate);
      } catch (const std::exception &e) {
        row["strict_then_candidate"] = {{"accepted", false},
                                        {"exception", e.what()}};
      }
    } else {
      const auto fault = std::get<DecodeFault>(decoded);
      row["current"] = {{"decoded", false},
                        {"accepted", false},
                        {"code", static_cast<int>(fault.code)},
                        {"offset", fault.byteOffset}};
      row["strict_then_candidate"] = {{"decoded", false}, {"accepted", false}};
    }
    for (const bool lossless : {false, true}) {
      const auto path = lossless ? "lossless_bridge" : "default_dom";
      try {
        auto candidate =
            J::parse(bytes, jsoncons::json_options{}.lossless_number(lossless));
        if (lossless)
          candidate = normalize(std::move(candidate));
        const auto &value = candidate.at("value");
        row[path] = {{"decoded", true},
                     {"accepted", validators.at(name).is_valid(value)}};
        if (item.at("group") != "B_original_structural")
          row[path]["identity"] = identity(value);
      } catch (const std::exception &e) {
        row[path] = {
            {"decoded", false}, {"accepted", false}, {"exception", e.what()}};
      }
    }
    rows.push_back(std::move(row));
  }
  std::cout << rows.dump(2) << '\n';
}
