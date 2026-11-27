// D research probe. Checks numeric representation and actual schema compilation.
#include <jsoncons/json.hpp>
#include <jsoncons_ext/jsonschema/jsonschema.hpp>
#include <fstream>
#include <iostream>
#include <map>
#include "SchemaPrimitives.h"
using jsoncons::json;
namespace js = jsoncons::jsonschema;
int main(int argc, char** argv) {
    if (argc < 2 || argc > 3) return 2;
    const auto numberSchema = json::parse(R"({"$schema":"https://json-schema.org/draft/2020-12/schema","type":"integer","minimum":0,"maximum":9007199254740991})");
    auto compiled = js::make_json_schema(numberSchema);
    json output;
    output["numbers"] = json::array();
    for (const auto* token : {"1", "1.0", "10e-1", "9007199254740991", "9007199254740991.1", "0.99999999999999999", "1e-99999", "0e99999"}) {
        json row;
        row["token"] = token;
        for (bool lossless : {false, true}) {
            const std::string name = lossless ? "lossless" : "default";
            try {
                const auto value = json::parse(token, jsoncons::json_options{}.lossless_number(lossless));
                row[name]["parsed"] = true;
                row[name]["is_string"] = value.is_string();
                row[name]["is_number"] = value.is_number();
                row[name]["valid_integer"] = compiled.is_valid(value);
                row[name]["serialized"] = value.to_string();
                if (lossless) {
                    // Reuse current exact decimal primitive, do not silently round.
                    using namespace hier::protocol::session;
                    const auto exact = schema::integer(JsonValue{JsonNumber{token}});
                    const json adapted = exact ? json(*exact) : value;
                    row[name]["adapted_valid_integer"] = compiled.is_valid(adapted);
                }
            } catch (const std::exception& e) {
                row[name]["parsed"] = false;
                row[name]["error"] = e.what();
            }
        }
        output["numbers"].push_back(std::move(row));
    }
    try {
        std::ifstream file(argv[1]);
        auto schema = json::parse(file);
        auto all = js::make_json_schema(schema, js::evaluation_options{}.require_format_validation(true));
        output["hier_schema_compiled"] = true;
        // Compile an entry with a 2020-12 keyword: dependentRequired.
        auto example = js::make_json_schema(json::parse(R"({"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","dependentRequired":{"x":["y"]}})"));
        output["dependentRequired_rejects_missing"] = !example.is_valid(json::parse(R"({"x":1})"));
        output["dependentRequired_accepts_present"] = example.is_valid(json::parse(R"({"x":1,"y":2})"));
        if (argc == 3) {
            std::ifstream input(argv[2]);
            const auto corpus = json::parse(input);
            std::map<std::string, js::json_schema<json>> validators;
            json results = json::array();
            for (const auto& row : corpus.at("cases").array_range()) {
                if (!row.contains("expectedAccept")) continue;
                const auto& definition = row.at("definition");
                std::string name;
                if (definition.is_string()) name = definition.as<std::string>();
                else {
                    name = definition.at("$ref").as<std::string>();
                    name = name.substr(name.find_last_of('/') + 1);
                }
                if (!validators.contains(name)) {
                    json entry;
                    entry["$schema"] = "https://json-schema.org/draft/2020-12/schema";
                    entry["$defs"] = schema.at("$defs");
                    entry["$ref"] = "#/$defs/" + name;
                    validators.emplace(name, js::make_json_schema(entry, js::evaluation_options{}.require_format_validation(true)));
                }
                const bool actual = validators.at(name).is_valid(row.at("input"));
                json result;
                result["name"] = row.at("name");
                result["expected"] = row.at("expectedAccept");
                result["actual"] = actual;
                result["passed"] = actual == row.at("expectedAccept").as<bool>();
                results.push_back(std::move(result));
            }
            output["structural_corpus"] = std::move(results);
        }
    } catch (const std::exception& e) {
        output["hier_schema_compiled"] = false;
        output["hier_schema_error"] = e.what();
    }
    std::cout << pretty_print(output) << '\n';
}
