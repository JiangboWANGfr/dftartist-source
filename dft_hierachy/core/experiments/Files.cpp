// V7: can we get the full list of files the compile actually read (sources, includes,
// library files found through -y), to hash as the snapshot's inputs?
#include <cstdio>
#include <map>

#include <slang/text/SourceManager.h>

#include "Common.h"

using namespace slang;

namespace hexp {

int cmdFiles(Loaded& l) {
    // Elaborate everything first: -y library files are loaded while parsing, but be
    // certain nothing is pulled in later.
    size_t before = l.comp->getSourceManager()->getAllBuffers().size();
    l.comp->getAllDiagnostics();
    auto& sm = *l.comp->getSourceManager();
    auto buffers = sm.getAllBuffers();

    std::map<std::string, size_t> files;  // path -> bytes
    size_t unnamed = 0;
    for (auto b : buffers) {
        auto& path = sm.getFullPath(b);
        if (path.empty()) {
            unnamed++;  // macro expansions and other in-memory buffers
            continue;
        }
        files[path.string()] = sm.getSourceText(b).size();
    }
    for (auto& [p, n] : files)
        std::printf("%s\t%zu\n", p.c_str(), n);
    std::fprintf(stderr, "buffers before elaboration: %zu, after: %zu, files: %zu, in-memory: %zu\n",
                 before, buffers.size(), files.size(), unnamed);
    return 0;
}

}  // namespace hexp
