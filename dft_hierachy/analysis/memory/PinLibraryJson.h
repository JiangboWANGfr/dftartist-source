#pragma once
#include "PinLibrary.h"
#include "hier/protocol/Json.h"
namespace dft::memory {
void writePinLibrary(hier::protocol::JsonWriter &,const PinLibrary &);
}
