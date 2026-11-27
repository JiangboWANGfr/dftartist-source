#pragma once
#include "hier/model/Model.h"

namespace hier::protocol {
// Own one stdio session; the Design lives exclusively on its worker thread.
// Returns zero on clean stdin EOF and nonzero on opening / transport failure.
int serve(model::OpenOptions options);
} // namespace hier::protocol
