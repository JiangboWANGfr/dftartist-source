#pragma once
#include "hier/Design.h"

namespace hier::app {
// Private CLI implementation; no installed or public kernel API.
int verifySharing(model::OpenOptions options);
} // namespace hier::app
