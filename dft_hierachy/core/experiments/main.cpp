#include <cstdio>
#include <cstring>

#include "Common.h"

int main(int argc, char** argv) {
    if (argc < 2) {
        std::fputs("usage: hier_exp <files|sharing|scale|scale-folded|drivers|clockstat|diags> <slang args>\n", stderr);
        return 2;
    }
    const char* cmd = argv[1];
    auto l = hexp::load(argc - 1, argv + 1);
    if (!std::strcmp(cmd, "files"))
        return hexp::cmdFiles(l);
    if (!std::strcmp(cmd, "sharing"))
        return hexp::cmdSharing(l);
    if (!std::strcmp(cmd, "scale"))
        return hexp::cmdScale(l);
    if (!std::strcmp(cmd, "scale-folded"))
        return hexp::cmdScaleFolded(l);
    if (!std::strcmp(cmd, "drivers"))
        return hexp::cmdDrivers(l);
    if (!std::strcmp(cmd, "clockstat"))
        return hexp::cmdClockStat(l);
    if (!std::strcmp(cmd, "diags"))
        return hexp::cmdDiags(l);
    std::fprintf(stderr, "unknown subcommand %s\n", cmd);
    return 2;
}
