// Force-included when building the OLD dft-core as the V5 oracle on macOS.
// The old sources call Tcl_GetErrorLine (Tcl 8.6); the system Tcl here is 8.5, and
// Homebrew's is 9.0 which the old sources do not compile against either. This supplies
// the one missing function so the old tree can be built unmodified.
#pragma once
#if __has_include(<tcl.h>)
#include <tcl.h>
#if TCL_MAJOR_VERSION == 8 && TCL_MINOR_VERSION < 6
static inline int Tcl_GetErrorLine(Tcl_Interp* interp) {
    return interp->errorLine;
}
#endif
#endif
