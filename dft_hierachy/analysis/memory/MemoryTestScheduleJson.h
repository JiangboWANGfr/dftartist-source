#pragma once
#include "MemoryTestSchedule.h"
#include "PinLibrary.h"
#include "hier/protocol/Json.h"
namespace dft::memory {
void writeMemoryTestSchedule(hier::protocol::JsonWriter &,const MemoryTestScheduleReport &,const PinLibrary * = nullptr);
}
