#undef NDEBUG  // asserts must fire even in Release builds — this test is assertion-driven

#include "spec.h"

#include <cassert>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string>

using namespace ctrlgen;

static bool throws(const std::string& json) {
    try {
        parseSpec(json);
        return false;
    } catch (const std::runtime_error&) {
        return true;
    }
}

static std::string readFile(const std::string& path) {
    std::ifstream in(path);
    assert(in && "fixture file missing");
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

int main(int argc, char** argv) {
    // scalar mux control + observe; dsIndex present
    auto s = parseSpec(R"({
      "schemaVersion": 2, "moduleBase": "pll_ctrl", "dsIndex": 1,
      "pins": [
        {"portName":"enable","mode":"control","width":1,"stitch":"mux",
         "target":"PLL_1/enable","muxName":"u_dfx_PLL_1_enable_persistent_mux_inst_ds1"},
        {"portName":"LOCKED","mode":"observe","width":1,"target":"PLL_1/LOCKED"}
      ]})");
    assert(moduleName(s) == "pll_ctrl_ds1");
    assert(s.pins.size() == 2);
    assert(s.pins[0].stitch.size() == 1 && s.pins[0].stitch[0] == "mux");
    assert(s.pins[0].muxName[0] == "u_dfx_PLL_1_enable_persistent_mux_inst_ds1");
    assert(s.gateCell.name == "cell_and2");  // default
    assert(s.dfxModeSource == "u_dfx_static_hyper_ctl_tdr/dfx_mode");

    // no dsIndex -> bare module name (EMA form); uniform bus stitch normalized per-bit
    auto e = parseSpec(R"({
      "schemaVersion": 2, "moduleBase": "m",
      "pins": [{"portName":"b","mode":"control","width":3,"stitch":"replace",
                "targets":["x/A","y/A","z/A"]}]})");
    assert(moduleName(e) == "m");
    assert(e.pins[0].stitch.size() == 3 && e.pins[0].stitch[2] == "replace");
    assert(e.pins[0].muxName.size() == 3 && e.pins[0].muxName[0] == "");

    // per-bit stitch array + per-bit muxName
    auto p = parseSpec(R"({
      "schemaVersion": 2, "moduleBase": "m",
      "pins": [{"portName":"c","mode":"control","width":2,"target":"U/c",
                "stitch":["replace","mux"],"muxName":[null,"u_dfx_U_c_persistent_mux_inst_ds1"]}]})");
    assert(p.pins[0].stitch[0] == "replace" && p.pins[0].stitch[1] == "mux");
    assert(p.pins[0].muxName[0] == "" && p.pins[0].muxName[1] != "");

    // violations (docs/specs §4.4)
    assert(throws(R"({"schemaVersion":2,"moduleBase":"9bad","pins":[]})"));            // bad identifier
    assert(throws(R"({"schemaVersion":2,"moduleBase":"m","pins":[
      {"portName":"a","mode":"control","width":1,"target":"t"}]})"));                  // control missing stitch
    assert(throws(R"({"schemaVersion":2,"moduleBase":"m","pins":[
      {"portName":"a","mode":"observe","width":1,"target":"t","stitch":"mux"}]})"));   // observe with stitch
    assert(throws(R"({"schemaVersion":2,"moduleBase":"m","pins":[
      {"portName":"a","mode":"control","width":2,"stitch":"replace","targets":["t"]}]})")); // targets len != width
    assert(throws(R"({"schemaVersion":2,"moduleBase":"m","pins":[
      {"portName":"a","mode":"control","width":1,"stitch":"replace","target":"t","targets":["t"]}]})")); // both
    assert(throws(R"({"schemaVersion":2,"moduleBase":"m","pins":[
      {"portName":"a","mode":"control","width":1,"stitch":"mux","target":"t"}]})"));   // mux missing muxName
    assert(throws(R"({"schemaVersion":2,"moduleBase":"m","pins":[
      {"portName":"a","mode":"control","width":1,"stitch":"replace","target":"t"},
      {"portName":"a","mode":"observe","width":1,"target":"t2"}]})"));                 // dup portName
    assert(throws(R"({"schemaVersion":2,"moduleBase":"m","pins":[
      {"portName":"a","mode":"control","width":2,"stitch":"mux","target":"t",
       "muxName":"u_dfx_t_a_persistent_mux_inst_ds1"}]})"));                           // bus mux w/ scalar muxName
    assert(throws(R"({"schemaVersion":2,"moduleBase":"m","pins":42})"));               // pins must be an array
    assert(throws(R"({"schemaVersion":2,"moduleBase":"m","pins":[
      {"portName":"a","mode":"control","width":1,"stitch":"mux","target":"t1",
       "muxName":"u_dfx_dup_persistent_mux_inst_ds1"},
      {"portName":"b","mode":"control","width":1,"stitch":"mux","target":"t2",
       "muxName":"u_dfx_dup_persistent_mux_inst_ds1"}]})"));                           // dup muxName
    assert(throws(R"({"schemaVersion":2,"moduleBase":"m","pins":[
      {"portName":"a","mode":"control","width":2,"target":"t","stitch":["mux","mux"],
       "muxName":["u_dfx_t_a_persistent_mux_inst_ds1","u_dfx_t_a_persistent_mux_inst_ds1"]}]})")); // per-bit dup muxName

    // Task 6 fixtures parse cleanly (ema/pll/fuse) — fixture dir passed by CMake (argv[1])
    if (argc > 1) {
        std::string dir = argv[1];
        auto ema = parseSpec(readFile(dir + "/ema.spec.json"));
        assert(ema.pins[1].targets.size() == 192);
        parseSpec(readFile(dir + "/pll.spec.json"));
        parseSpec(readFile(dir + "/fuse.spec.json"));
    } else {
        std::printf("(fixture smoke skipped: no dir arg)\n");
    }

    std::printf("test_ctrlgen_spec OK\n");
    return 0;
}
