#include "catalog.h"

#include <stdexcept>

namespace specgen {

namespace {

const DftPort DATA_IN{"bus_data_in", "in", "data"};
const DftPort DATA_OUT{"bus_data_out", "out", "data"};
const DftPort CLOCK{"bus_clock", "in", "clock"};

const std::vector<DftCatalogEntry>& catalog() {
    static const std::vector<DftCatalogEntry> table = {
        {"ScanHost", {DATA_IN, DATA_OUT, CLOCK, {"chain_group_out", "out", "chain"}}},
        {"Receiver1xPipeline", {DATA_IN, DATA_OUT, CLOCK}},
        {"OutputPipeline", {DATA_IN, DATA_OUT, CLOCK}},
        {"Pipeline", {DATA_IN, DATA_OUT, CLOCK}},
        {"Multiplexer",
         {{"master_bus_data_in", "in", "master"},
          {"secondary_bus_data_in", "in", "secondary"},
          DATA_OUT, CLOCK}},
        {"Fifo",
         {DATA_IN, DATA_OUT,
          {"bus_in_clock", "in", "clock"},
          {"bus_out_clock", "in", "clock"}}},
        {"BusFrequencyDivider", {DATA_IN, DATA_OUT, CLOCK}},
        {"BusFrequencyMultiplier", {DATA_IN, DATA_OUT, CLOCK}},
        {"DesignInstance", {DATA_IN, DATA_OUT}},
        {"Edt", {{"ssh_chain_group_in", "in", "chain"}}},
        {"EBScanPipeline",
         {{"scan_in", "in", "data"},
          {"scan_out", "out", "data"},
          {"bscan_clock", "in", "clock"}}},
        {"STapPipeline",
         {{"scan_in", "in", "data"},
          {"scan_out", "out", "data"},
          {"tck", "in", "clock"}}},
    };
    return table;
}

}  // namespace

const DftCatalogEntry& catalogEntry(const std::string& ipType) {
    for (const auto& e : catalog())
        if (e.ipType == ipType) return e;
    throw std::runtime_error("unknown DFT IP type: " + ipType);
}

}  // namespace specgen
