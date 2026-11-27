#include "MemoryResourceUsageComparisonJson.h"
#include "MemoryResourceUsageJsonInternal.h"
namespace dft::memory {
namespace {
const char *statusName(MemoryResourceComparisonStatus status) {
    switch(status) {
    case MemoryResourceComparisonStatus::MissingResource:return "missing_resource";
    case MemoryResourceComparisonStatus::ReferenceMissing:return "reference_missing";
    case MemoryResourceComparisonStatus::DomainMismatch:return "domain_mismatch";
    case MemoryResourceComparisonStatus::PartitionMismatch:return "partition_mismatch";
    case MemoryResourceComparisonStatus::Partial:return "partial";
    case MemoryResourceComparisonStatus::Compared:return "compared";
    }
    throw hier::Error{hier::ErrorCode::Internal,"Invalid resource comparison status"};
}
}
void writeMemoryResourceUsageComparison(hier::protocol::JsonWriter &w,const MemoryResourceUsageComparison &r,const PinLibrary *library) {
    w.beginObject().key("formatVersion").value(1).key("algorithm").value("rtl-memory-resource-usage-comparison-v1").key("reference").value(0).key("complete").value(r.complete).key("source");writeMemoryTestComparison(w,r.source,library);
    w.key("configurations").beginArray();for(const auto &usage:r.configurations)detail::writeMemoryResourceUsageBody(w,usage);w.endArray().key("rows").beginArray();
    for(const auto &row:r.rows) {
        w.beginObject().key("name").value(row.name).key("cells").beginArray();
        for(const auto &cell:row.cells) {
            w.beginObject().key("status").value(statusName(cell.status));if(cell.resource)w.key("resource").value(uint64_t(*cell.resource));
            if(cell.delta){const auto &d=*cell.delta;w.key("delta").beginObject().key("occupiedPicoseconds").value(d.occupiedPicoseconds).key("peakControllers").value(d.peakControllers).key("peakPowerMicrowatts").value(d.peakPowerMicrowatts);if(d.peakUnits)w.key("peakUnits").value(*d.peakUnits);w.endObject();}
            w.endObject();
        }
        w.endArray().endObject();
    }
    w.endArray().endObject();
}
}
