// A ScanHost chain group is not one EDT.
//
// The wire says which ScanHost a controller hangs off; the controller's own
// `Connections { ssh_chain_group: … }` says which group it joins there. Two controllers naming
// the same group must produce ONE `ChainGroup (name)` sized for both of them — the old code
// emitted one group per controller, named after it, and overwrote anything the engineer typed.

#undef NDEBUG
#include "dftspec.h"

#include <cassert>
#include <cstdio>
#include <string>

#include "document.h"

using namespace specgen;

namespace {

// Two EDTs off one ScanHost. `cfg1`/`cfg2` are their `config` objects.
std::string gen(const std::string& cfg1, const std::string& cfg2) {
    const std::string doc = R"({
      "schemaVersion": 1,
      "library": { "defs": [ {
        "id": "p", "designName": "p", "designLevel": "chip", "designType": "hierarchical",
        "interfaces": [ { "id": "ext", "busType": "SSN", "role": "client", "busWidth": 8 } ],
        "childInstances": [], "connections": [],
        "dftIps": [
          { "id": "sh", "ipType": "ScanHost", "instanceName": "ssh_1", "position": {"x":0,"y":0} },
          { "id": "e1", "ipType": "Edt", "instanceName": "int_edt", "position": {"x":9,"y":0},
            "config": )" + cfg1 + R"( },
          { "id": "e2", "ipType": "Edt", "instanceName": "ext_edt", "position": {"x":9,"y":9},
            "config": )" + cfg2 + R"( }
        ],
        "dftWires": [
          { "id": "w1", "from": {"kind":"iface","instanceId":"p","interfaceId":"ext","pin":"out"},
                        "to":   {"kind":"ip","ipId":"sh","port":"bus_data_in"} },
          { "id": "w2", "from": {"kind":"ip","ipId":"sh","port":"bus_data_out"},
                        "to":   {"kind":"iface","instanceId":"p","interfaceId":"ext","pin":"in"} },
          { "id": "w3", "from": {"kind":"ip","ipId":"sh","port":"chain_group_out"},
                        "to":   {"kind":"ip","ipId":"e1","port":"ssh_chain_group_in"} },
          { "id": "w4", "from": {"kind":"ip","ipId":"sh","port":"chain_group_out"},
                        "to":   {"kind":"ip","ipId":"e2","port":"ssh_chain_group_in"} }
        ]
      } ] },
      "ui": { "openDefId": "p", "rootDefId": "p" }
    })";
    return genDftSpec(parseScope(doc.c_str()));
}

int count(const std::string& hay, const std::string& needle) {
    int n = 0;
    for (std::size_t at = hay.find(needle); at != std::string::npos; at = hay.find(needle, at + 1)) n++;
    return n;
}
void has(const std::string& got, const std::string& needle) {
    if (got.find(needle) == std::string::npos) {
        std::fprintf(stderr, "missing %s in:\n%s\n", needle.c_str(), got.c_str());
        assert(false);
    }
}

}  // namespace

int main() {
    // 1. Nothing configured: one group per controller, named after it. The common case, unchanged.
    {
        const std::string got = gen("{}", "{}");
        has(got, "ChainGroup (int_edt)");
        has(got, "ChainGroup (ext_edt)");
        has(got, "ssh_chain_group             : int_edt;");
        has(got, "ssh_chain_group             : ext_edt;");
        assert(count(got, "ChainGroup (") == 2);
    }

    // 2. BOTH controllers name the same group -> ONE ChainGroup, and the ScanHost is sized for
    //    both of them (2+1 in, 2+1 out). This is the case the old shape could not express.
    {
        const std::string got = gen(
            R"({"input_channel_count":"2","output_channel_count":"2",
                "Connections":{"ssh_chain_group":"edt_gp"}})",
            R"({"input_channel_count":"1","output_channel_count":"1",
                "Connections":{"ssh_chain_group":"edt_gp"}})");
        assert(count(got, "ChainGroup (") == 1);
        has(got, "ChainGroup (edt_gp)");
        has(got, "input_chain_count           : 3;");
        has(got, "output_chain_count          : 3;");
        // Neither controller had its group renamed to its own instance name.
        assert(count(got, "ssh_chain_group             : edt_gp;") == 2);
        assert(got.find("ssh_chain_group             : int_edt;") == std::string::npos);
    }

    // 3. A hand-written ChainGroup on the ScanHost is merged into, not duplicated, and a count
    //    the engineer typed wins over the derived sum.
    {
        const std::string doc = R"({
          "schemaVersion": 1,
          "library": { "defs": [ {
            "id": "p", "designName": "p", "designLevel": "chip", "designType": "hierarchical",
            "interfaces": [ { "id": "ext", "busType": "SSN", "role": "client", "busWidth": 8 } ],
            "childInstances": [], "connections": [],
            "dftIps": [
              { "id": "sh", "ipType": "ScanHost", "instanceName": "ssh_1", "position": {"x":0,"y":0},
                "config": { "ChainGroup": [ { "id": "edt_gp", "input_chain_count": "9" } ] } },
              { "id": "e1", "ipType": "Edt", "instanceName": "int_edt", "position": {"x":9,"y":0},
                "config": { "input_channel_count": "2", "output_channel_count": "2",
                            "Connections": { "ssh_chain_group": "edt_gp" } } }
            ],
            "dftWires": [
              { "id": "w1", "from": {"kind":"iface","instanceId":"p","interfaceId":"ext","pin":"out"},
                            "to":   {"kind":"ip","ipId":"sh","port":"bus_data_in"} },
              { "id": "w2", "from": {"kind":"ip","ipId":"sh","port":"bus_data_out"},
                            "to":   {"kind":"iface","instanceId":"p","interfaceId":"ext","pin":"in"} },
              { "id": "w3", "from": {"kind":"ip","ipId":"sh","port":"chain_group_out"},
                            "to":   {"kind":"ip","ipId":"e1","port":"ssh_chain_group_in"} }
            ]
          } ] },
          "ui": { "openDefId": "p", "rootDefId": "p" }
        })";
        const std::string got = genDftSpec(parseScope(doc));
        assert(count(got, "ChainGroup (") == 1);
        has(got, "input_chain_count           : 9;");   // typed, kept
        has(got, "output_chain_count          : 2;");   // absent, derived
    }

    std::puts("test_specgen_chaingroup OK");
    return 0;
}
