# Slang is pinned to a release and built from source (docs/DESIGN.md 7.1).
# Bumping HIER_SLANG_TAG requires redoing verification item V1; see
# frontend/SHARING_VERIFIED.md.
set(HIER_SLANG_TAG "v12.0" CACHE STRING "Pinned slang release")

# slang bundles mimalloc and, when enabled, replaces the global operator new with it.
# That is a speed-up for optimised builds only:
#  - under the sanitizers it would hide every C++ heap allocation from AddressSanitizer;
#  - in Debug its assertions abort the process when anything allocates during static
#    destruction at exit (Catch2 does).
if(HIER_SANITIZE OR CMAKE_BUILD_TYPE STREQUAL "Debug")
  set(SLANG_USE_MIMALLOC OFF CACHE BOOL "" FORCE)
endif()

include(FetchContent)
set(SLANG_INCLUDE_TESTS OFF CACHE BOOL "" FORCE)
set(SLANG_INCLUDE_TOOLS OFF CACHE BOOL "" FORCE)
set(SLANG_INCLUDE_INSTALL OFF CACHE BOOL "" FORCE)
FetchContent_Declare(
  slang
  GIT_REPOSITORY https://github.com/MikePopoloski/slang.git
  GIT_TAG ${HIER_SLANG_TAG}
  GIT_SHALLOW ON
  SYSTEM
)
FetchContent_MakeAvailable(slang)
include(${CMAKE_CURRENT_LIST_DIR}/SlangElaboration.cmake)
include(${CMAKE_CURRENT_LIST_DIR}/SlangDriverTracking.cmake)

# Identity of the slang sources actually being built, for the body-sharing gate
# (frontend/SHARING_VERIFIED.md). It is a hash over the files that implement slang's
# instance caching, so it does not depend on git metadata being present, and it changes
# whenever that logic changes, whatever version number the sources report.
set(_hier_slang_id_input "")
foreach(_f source/ast/ElabVisitors.h source/ast/InstanceCacheKey.cpp
           include/slang/ast/InstanceCacheKey.h)
  if(EXISTS "${slang_SOURCE_DIR}/${_f}")
    file(SHA256 "${slang_SOURCE_DIR}/${_f}" _h)
  else()
    set(_h "missing")
  endif()
  string(APPEND _hier_slang_id_input "${_f}:${_h};")
endforeach()
string(SHA256 HIER_SLANG_SOURCE_ID "${_hier_slang_id_input}")
message(STATUS "slang source id: ${HIER_SLANG_SOURCE_ID}")
