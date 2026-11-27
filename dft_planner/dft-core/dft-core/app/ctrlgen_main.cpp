#include <cstdio>
#include <exception>
#include <fstream>
#include <sstream>
#include <string>
#include <string_view>

#include "gen_icl.h"
#include "gen_tcl.h"
#include "gen_v.h"
#include "spec.h"

static std::string readFile(const std::string& p) {
    std::ifstream in(p);
    std::stringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

// ctrlgen gen <spec.json> -> <mod>.v / <mod>.icl / <mod>.tcl (===FILE:<name>=== delimited)
int main(int argc, char** argv) {
    if (argc >= 3 && std::string_view(argv[1]) == "gen") {
        try {
            auto spec = ctrlgen::parseSpec(readFile(argv[2]));
            const std::string mod = ctrlgen::moduleName(spec);
            std::printf("===FILE:%s.v===\n", mod.c_str());
            std::fputs(ctrlgen::generateVerilog(spec).c_str(), stdout);
            std::printf("===FILE:%s.icl===\n", mod.c_str());
            std::fputs(ctrlgen::generateIcl(spec).c_str(), stdout);
            std::printf("===FILE:%s.tcl===\n", mod.c_str());
            std::fputs(ctrlgen::generateStitchTcl(spec).c_str(), stdout);
            return 0;
        } catch (const std::exception& e) {
            std::fprintf(stderr, "ctrlgen: %s\n", e.what());
            return 2;
        }
    }
    std::fprintf(stderr, "usage: ctrlgen gen <spec.json>\n");
    return 2;
}
