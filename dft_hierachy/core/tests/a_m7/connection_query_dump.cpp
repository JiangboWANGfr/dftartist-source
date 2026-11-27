// Test-only public C++ consumer, including the existing cache/sharing options.
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <cstdio>
#include <string>

int main(int argc, char **argv) {
    if (argc != 9)
        return 2;
    hier::model::OpenOptions options;
    options.files = {argv[1]};
    options.tops = {argv[2]};
    options.connectionCacheBytes = std::stoull(argv[3]);
    options.forcePerInstanceBodies = std::string(argv[4]) == "per-instance";
    auto opened = hier::Design::open(options);
    if (!opened || (*opened)->diagnostics().errorCount)
        return 3;
    hier::ConnectionRequest request;
    request.reach = argv[7];
    request.side = std::string(argv[8]) == "-" ? "" : argv[8];
    auto reply = std::string(argv[5]) == "loads" ? (*opened)->loads(argv[6], request)
                                                : (*opened)->drivers(argv[6], request);
    hier::protocol::JsonWriter writer;
    if (reply)
        hier::protocol::write(writer, *reply);
    else
        hier::protocol::write(writer, reply.error());
    std::puts(writer.str().c_str());
    return reply ? 0 : 2;
}
