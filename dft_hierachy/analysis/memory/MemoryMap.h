#pragma once
#include "MacroInterfaces.h"
namespace dft::memory {
enum class MemoryRole { Address, DataIn, DataOut, Clock, ChipEnable, WriteEnable, OutputEnable, WriteMask };
enum class PinSense { None, High, Low, Posedge, Negedge };
std::string_view roleName(MemoryRole);
std::string_view senseName(PinSense);
std::optional<MemoryRole> parseMemoryRole(std::string_view);
std::optional<PinSense> parsePinSense(std::string_view);
struct RoleBinding { MemoryRole role=MemoryRole::Address; std::string pin; PinSense sense=PinSense::None; };
struct MemoryModel {
    std::string definitionName;
    uint64_t words=0,dataBits=0,maskLaneBits=1;
    std::vector<RoleBinding> roles;
};
struct MappingLimits { uint64_t maxMacros=1000,maxWork=1000000,maxMillis=1000; };
struct MemoryMapRequest { std::vector<MemoryModel> models; MappingLimits limits; };
struct MappingIssue { std::string code,role,pin,expected,actual; };
struct MappedRole { size_t role=0; std::optional<size_t> pin; bool compatible=false; };
struct MappedMemory {
    size_t macro=0;
    std::optional<size_t> model;
    std::string status;
    std::vector<MappedRole> roles;
    std::vector<MappingIssue> issues;
};
struct MemoryMap {
    MemoryMapRequest request;
    std::string snapshotId;
    bool complete=true;
    std::vector<std::string> reasons;
    uint64_t work=0,visitedMacros=0,matchedInstances=0,matchedCapacityBits=0;
    std::vector<MappedMemory> memories;
};
// Borrows an unmodified producer only during this call; owned indices refer to that producer.
// Models are caller declarations, never evidence of RAM function or physical capacity.
hier::Result<MemoryMap> mapMemories(const MacroInterfaces &,const MemoryMapRequest &,hier::Cancel = {});
}
