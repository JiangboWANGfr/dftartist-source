#include <cstdio>
#include <exception>
#include <fstream>
#include <sstream>
#include <string>
#include <string_view>

#include "document.h"
#include "dftspec.h"
#include "gen.h"
#include "json/JsonValue.h"

static std::string readFile(const std::string& p) {
    std::ifstream in(p);
    std::stringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

// specgen gen <doc.json>       -> full DftSpecification text to stdout
// specgen fragment <frag.json> -> single-IP .spec fragment (config-dialog preview) to stdout
//   frag.json = { "ipType": "...", "instanceName": "...", "config": { ... } }
int main(int argc, char** argv) {
    if (argc >= 3 && std::string_view(argv[1]) == "gen") {
        try {
            specgen::SpecgenScope scope = specgen::parseScope(readFile(argv[2]));
            std::string out = specgen::genDftSpec(scope);
            std::fwrite(out.data(), 1, out.size(), stdout);
            return 0;
        } catch (const std::exception& e) {
            std::fprintf(stderr, "specgen: %s\n", e.what());
            return 2;
        }
    }
    if (argc >= 3 && std::string_view(argv[1]) == "fragment") {
        try {
            hdl::json::Value f = hdl::json::parse(readFile(argv[2]));
            hdl::json::Value config;
            if (const hdl::json::Value* c = f.find("config")) config = *c;
            else config.type = hdl::json::Value::Type::Object;
            std::string out =
                specgen::generateFragment(f.str("ipType"), f.str("instanceName"), config);
            std::fwrite(out.data(), 1, out.size(), stdout);
            return 0;
        } catch (const std::exception& e) {
            std::fprintf(stderr, "specgen: %s\n", e.what());
            return 2;
        }
    }
    std::fprintf(stderr, "usage: specgen <gen <doc.json> | fragment <frag.json>>\n");
    return 2;
}
