#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <string_view>

#include "document.h"
#include "generate.h"
#include "inject_slang.h"
#include "vinject.h"

static std::string readFile(const std::string& p) {
    std::ifstream in(p);
    std::stringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

// genconn generate <doc.json>       -> root connection file text to stdout
// genconn generate-all <doc.json>   -> all files (===FILE:<path>=== delimited)
int main(int argc, char** argv) {
    if (argc >= 3 && std::string_view(argv[1]) == "generate") {
        auto doc = genconn::parseDocument(readFile(argv[2]));
        const genconn::HardenDef* root = nullptr;
        for (auto& d : doc.library.defs)
            if (d.id == doc.rootDefId) root = &d;
        if (!root) {
            std::fprintf(stderr, "rootDefId '%s' not found\n", doc.rootDefId.c_str());
            return 2;
        }
        auto res = genconn::generate(*root, doc.library, true);
        if (res) std::fwrite(res->text.data(), 1, res->text.size(), stdout);
        return 0;
    }
    if (argc >= 3 && std::string_view(argv[1]) == "generate-all") {
        auto doc = genconn::parseDocument(readFile(argv[2]));
        for (auto& r : genconn::generateAll(doc.library, doc.rootDefId)) {
            std::printf("===FILE:%s===\n", r.file.c_str());
            std::fwrite(r.text.data(), 1, r.text.size(), stdout);
        }
        return 0;
    }
    if (argc >= 4 &&
        (std::string_view(argv[1]) == "inject" || std::string_view(argv[1]) == "inject-slang")) {
        bool useSlang = std::string_view(argv[1]) == "inject-slang";
        auto doc = genconn::parseDocument(readFile(argv[2]));
        std::string vText = readFile(argv[3]);
        std::string parentDefId = (argc >= 5) ? argv[4] : doc.rootDefId;
        std::string out = useSlang ? genconn::injectDftSlang(vText, doc.library, parentDefId)
                                   : genconn::injectDft(vText, doc.library, parentDefId);
        std::fwrite(out.data(), 1, out.size(), stdout);
        return 0;
    }
    if (argc >= 3 && std::string_view(argv[1]) == "parse-check") {
        int errs = genconn::parseErrorCount(readFile(argv[2]));
        std::printf("%d\n", errs);
        return errs == 0 ? 0 : 1;
    }
    std::fprintf(stderr, "usage: genconn <generate|generate-all> <doc.json>\n"
                         "       genconn inject|inject-slang <doc.json> <netlist.v> [parentDefId]\n"
                         "       genconn parse-check <netlist.v>\n");
    return 2;
}
