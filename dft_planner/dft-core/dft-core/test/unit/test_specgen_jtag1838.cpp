#undef NDEBUG
#include "dftspec.h"

#include <cassert>
#include <cstdio>
#include <string>

#include "document.h"

using namespace specgen;

int main() {
    const char* doc = R"({
      "schemaVersion": 1,
      "library": { "defs": [ {
        "id": "d", "designName": "d", "designLevel": "physical_block", "designType": "hierarchical",
        "interfaces": [
          { "id": "cl", "busType": "JTAG1838", "role": "client" },
          { "id": "r1", "busType": "JTAG1838", "role": "secondary", "interfaceName": "r1" }
        ],
        "childInstances": [], "connections": [],
        "dftIps": [
          { "id": "sp1", "ipType": "STapPipeline", "instanceName": "sp1", "position": {"x":0,"y":0} }
        ],
        "dftWires": [
          { "id": "w1", "from": {"kind":"iface","instanceId":"d","interfaceId":"cl","pin":"out"},
                        "to":   {"kind":"ip","ipId":"sp1","port":"scan_in"} },
          { "id": "w2", "from": {"kind":"ip","ipId":"sp1","port":"scan_out"},
                        "to":   {"kind":"iface","instanceId":"d","interfaceId":"r1","pin":"in"} },
          { "id": "w3", "from": {"kind":"iface","instanceId":"d","interfaceId":"r1","pin":"out"},
                        "to":   {"kind":"iface","instanceId":"d","interfaceId":"cl","pin":"in"} }
        ]
      } ] },
      "ui": { "openDefId": "d", "rootDefId": "d" }
    })";
    SpecgenScope scope = parseScope(doc);
    std::string got = genDftSpec(scope);
    std::string want =
        "set spec [create_dft_specification -stap_host_list {\n"
        "  pipe(sp1)\n"
        "  sec_host(r1)\n"
        "}]\n";
    if (got != want) {
        std::fprintf(stderr, "--- got ---\n%s\n--- want ---\n%s\n", got.c_str(), want.c_str());
        assert(false);
    }

    // secondary placement="other" → host（而非 sec_host）
    const char* docHost = R"({
      "schemaVersion": 1,
      "library": { "defs": [ {
        "id": "d", "designName": "d", "designLevel": "physical_block", "designType": "hierarchical",
        "interfaces": [
          { "id": "cl", "busType": "JTAG1838", "role": "client" },
          { "id": "r1", "busType": "JTAG1838", "role": "secondary", "interfaceName": "r1", "placement": "other" }
        ],
        "childInstances": [], "connections": [],
        "dftIps": [
          { "id": "sp1", "ipType": "STapPipeline", "instanceName": "sp1", "position": {"x":0,"y":0} }
        ],
        "dftWires": [
          { "id": "w1", "from": {"kind":"iface","instanceId":"d","interfaceId":"cl","pin":"out"},
                        "to":   {"kind":"ip","ipId":"sp1","port":"scan_in"} },
          { "id": "w2", "from": {"kind":"ip","ipId":"sp1","port":"scan_out"},
                        "to":   {"kind":"iface","instanceId":"d","interfaceId":"r1","pin":"in"} },
          { "id": "w3", "from": {"kind":"iface","instanceId":"d","interfaceId":"r1","pin":"out"},
                        "to":   {"kind":"iface","instanceId":"d","interfaceId":"cl","pin":"in"} }
        ]
      } ] },
      "ui": { "openDefId": "d", "rootDefId": "d" }
    })";
    std::string gotHost = genDftSpec(parseScope(docHost));
    std::string wantHost =
        "set spec [create_dft_specification -stap_host_list {\n"
        "  pipe(sp1)\n"
        "  host\n"
        "}]\n";
    if (gotHost != wantHost) {
        std::fprintf(stderr, "--- gotHost ---\n%s\n--- wantHost ---\n%s\n", gotHost.c_str(), wantHost.c_str());
        assert(false);
    }

    std::printf("test_specgen_jtag1838 OK\n");
    return 0;
}
