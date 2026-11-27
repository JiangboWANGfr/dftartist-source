// B compile-only public consumer: DESIGN5.6.1, no private Core access.
#include "hier/model/Model.h"
#include "hier/model/Schema.h"
#include <concepts>
#include <vector>
template <typename T>
concept Snapshot7 = requires(const T& s) {
    s.snapshotId; s.inputHash; s.inputHashComplete; s.indexState;
    s.openedAt; s.topCandidates;
};
static_assert(Snapshot7<hier::model::SnapshotInfo>,
              "M4 requires the six public schema7 snapshot metadata members");
static_assert(std::same_as<decltype(hier::model::SnapshotInfo{}.tops),
                           std::vector<hier::model::InstInfo>>,
              "M4 must preserve old tops InstInfo vector shape");
static_assert(hier::model::kSchemaVersion == 7, "M4 supported model version must be7");
