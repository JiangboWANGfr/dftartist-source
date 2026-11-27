cmake_minimum_required(VERSION 3.20)
project(dft_core CXX)  # umbrella repo; libs: hdlcore (+ future genconn, drc)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# --- build type must match the vendored slang's ABI ---
# The vendored slang static lib is built Release (NDEBUG). A Debug (no-NDEBUG) build of dft-core is
# ABI-INCOMPATIBLE with it: dft-core's *inline* slang header accessors read slang struct members at
# offsets that disagree with the prebuilt lib's object layout → SIGSEGV deep in slang internals
# (e.g. Compilation::getSourceManager / Scope::ensureElaborated). Default to a NDEBUG build so a plain
# `cmake -S . -B build` matches the lib; a Debug build needs a Debug-built slang (or slang from source).
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE RelWithDebInfo CACHE STRING "Build type (NDEBUG, to match vendored slang ABI)" FORCE)
endif()
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
  message(WARNING "CMAKE_BUILD_TYPE=Debug is ABI-incompatible with the vendored Release slang lib "
                  "(expect SIGSEGV in slang internals). Use RelWithDebInfo/Release, or supply a Debug/source slang.")
endif()

# --- locate slang (vendored prebuilt; override with -DSLANG_INSTALL_DIR=...) ---
# third_party/slang holds slang's headers + static libs (libsvlang/libfmt/libmimalloc) +
# cmake config + its vendored external headers (BS_thread_pool.hpp, expected.hpp, ...),
# so the build is self-contained (no external paths). slang v10.0.101, macOS arm64.
set(SLANG_INSTALL_DIR "${CMAKE_SOURCE_DIR}/third_party/slang"
    CACHE PATH "Vendored slang install prefix")
list(PREPEND CMAKE_PREFIX_PATH "${SLANG_INSTALL_DIR}")
find_package(slang REQUIRED)

# --- hdl-core library: HDL -> design model (slang) ---
add_library(hdlcore STATIC
  hdl-core/service/Filelist.cpp
  hdl-core/frontend/SlangCompile.cpp
  hdl-core/service/SlangHelpers.cpp
  hdl-core/service/Hierarchy.cpp
  hdl-core/service/Netlist.cpp
  hdl-core/service/DesignDb.cpp
  hdl-core/service/ScanBudget.cpp
  hdl-core/service/SdcLite.cpp
  hdl-core/service/SdcTcl.cpp
  hdl-core/service/DpShell.cpp
  hdl-core/service/DftLib.cpp
  hdl-core/protocol/NdjsonServer.cpp)
target_include_directories(hdlcore PUBLIC ${CMAKE_SOURCE_DIR}/hdl-core)
target_link_libraries(hdlcore PUBLIC slang::slang)

# --- embedded Tcl: SDC *is* Tcl, so constraints are evaluated by a real interpreter with our
# --- SDC commands registered as C callbacks (variables / foreach / nested [..] / source all work).
# Off => SdcTcl reports "no interpreter" instead of silently mis-parsing.
option(HDL_WITH_TCL "Embed a Tcl interpreter for SDC evaluation" ON)
if(HDL_WITH_TCL)
  find_package(TCL QUIET)
  if(NOT TCL_FOUND)
    find_package(PkgConfig QUIET)
    if(PkgConfig_FOUND)
      pkg_check_modules(TCLPC QUIET tcl)
    endif()
  endif()
  # Resolve once into neutral variables: both hdlcore (SDC *reading*) and sdccore (SDC *checking*)
  # need the same interpreter, and duplicating the detection is how the two drift apart.
  if(TCL_FOUND)
    set(SDC_TCL_INCLUDE ${TCL_INCLUDE_PATH})
    set(SDC_TCL_LIBS ${TCL_LIBRARY})
    message(STATUS "SDC: embedded Tcl ${TCL_LIBRARY}")
  elseif(TCLPC_FOUND)
    set(SDC_TCL_INCLUDE ${TCLPC_INCLUDE_DIRS})
    set(SDC_TCL_LIBS ${TCLPC_LINK_LIBRARIES})
    message(STATUS "SDC: embedded Tcl (pkg-config) ${TCLPC_LINK_LIBRARIES}")
  else()
    message(WARNING "SDC: no Tcl found -> SDC reading/checking disabled (set HDL_WITH_TCL=OFF to silence)")
  endif()
  if(SDC_TCL_LIBS)
    set(SDC_TCL_AVAILABLE ON)
    target_include_directories(hdlcore PRIVATE ${SDC_TCL_INCLUDE})
    target_link_libraries(hdlcore PUBLIC ${SDC_TCL_LIBS})
    target_compile_definitions(hdlcore PRIVATE HDL_HAVE_TCL=1)
  endif()
endif()
# slang's analysis headers #include <BS_thread_pool.hpp>/<expected.hpp>; those live in the
# vendored include/ dir, already on slang::slang's INTERFACE_INCLUDE_DIRECTORIES.

# --- CLI executable ---
add_executable(hdl app/cli_main.cpp)
target_link_libraries(hdl PRIVATE hdlcore)

# --- genconn-core library: connection generation (no slang) ---
add_library(genconncore STATIC
  genconn-core/expand.cpp
  genconn-core/order.cpp
  genconn-core/validate.cpp
  genconn-core/generate.cpp
  genconn-core/inject_payload.cpp
  genconn-core/vinject.cpp
  genconn-core/document.cpp)
target_include_directories(genconncore
  PUBLIC ${CMAKE_SOURCE_DIR}/genconn-core
  PRIVATE ${CMAKE_SOURCE_DIR}/hdl-core)  # header-only json/JsonValue.h
# --- inject-core: slang-anchored DFT injection (links genconn payload + slang parser) ---
add_library(injectcore STATIC inject-core/inject_slang.cpp)
target_include_directories(injectcore
  PUBLIC ${CMAKE_SOURCE_DIR}/inject-core
  PRIVATE ${CMAKE_SOURCE_DIR}/genconn-core)
target_link_libraries(injectcore PUBLIC genconncore slang::slang)

add_executable(genconn app/genconn_main.cpp)
target_link_libraries(genconn PRIVATE genconncore injectcore)

# --- ctrlgen-core library: DFX ctrl IP generation (no slang) ---
add_library(ctrlgencore STATIC
  ctrlgen-core/spec.cpp
  ctrlgen-core/gen_v.cpp
  ctrlgen-core/gen_icl.cpp
  ctrlgen-core/gen_tcl.cpp)
target_include_directories(ctrlgencore
  PUBLIC ${CMAKE_SOURCE_DIR}/ctrlgen-core
  PRIVATE ${CMAKE_SOURCE_DIR}/hdl-core)  # header-only json/JsonValue.h

add_executable(ctrlgen app/ctrlgen_main.cpp)
target_link_libraries(ctrlgen PRIVATE ctrlgencore)

# --- specgen-core library: SSN DftSpecification generation (no slang) ---
# Embed datapath.schema.json into the binary (R"SPECGENSCHEMA(...)" delimiter avoids )" collisions).
file(READ ${CMAKE_SOURCE_DIR}/specgen-core/datapath.schema.json SPECGEN_SCHEMA_CONTENT)
file(READ ${CMAKE_SOURCE_DIR}/specgen-core/bscan.schema.json SPECGEN_BSCAN_SCHEMA_CONTENT)
configure_file(specgen-core/schema_embedded.h.in
  ${CMAKE_BINARY_DIR}/generated/schema_embedded.h @ONLY)

add_library(specgencore STATIC
  specgen-core/document.cpp
  specgen-core/schema.cpp
  specgen-core/catalog.cpp
  specgen-core/gen.cpp
  specgen-core/datapath.cpp
  specgen-core/dftspec.cpp
  specgen-core/bscan.cpp
  specgen-core/jtag1838.cpp)
target_include_directories(specgencore
  PUBLIC ${CMAKE_SOURCE_DIR}/specgen-core
         ${CMAKE_SOURCE_DIR}           # cross-lib "genconn-core/..." includes
         ${CMAKE_SOURCE_DIR}/hdl-core  # model.h exposes hdl::json::Value
  PRIVATE ${CMAKE_BINARY_DIR}/generated)  # generated schema_embedded.h
target_link_libraries(specgencore PUBLIC genconncore)

add_executable(specgen app/specgen_main.cpp)
target_link_libraries(specgen PRIVATE specgencore)

# --- drc-core library: clock/reset DFT-DRC on the hdl-core design model ---
add_library(drccore STATIC drc-core/check.cpp)
target_include_directories(drccore
  PUBLIC ${CMAKE_SOURCE_DIR}/drc-core
  PRIVATE ${CMAKE_SOURCE_DIR}/hdl-core)
target_link_libraries(drccore PUBLIC hdlcore)

add_executable(drc app/drc_main.cpp)
target_link_libraries(drc PRIVATE drccore)

# --- sdc-core library: SDC syntax/semantic checker -------------------------------------------
# Standalone on purpose: the syntax + command + dialect layers need nothing but Tcl, so the
# linter builds and tests without slang. The design-aware layer takes its object lists as plain
# strings, which the ndjson server fills from DesignDb.
add_library(sdccore STATIC
  sdc-core/model.cpp
  sdc-core/spec.cpp
  sdc-core/lint.cpp
  sdc-core/clockgen.cpp)
target_include_directories(sdccore PUBLIC ${CMAKE_SOURCE_DIR}/sdc-core)
if(SDC_TCL_AVAILABLE)
  target_include_directories(sdccore PRIVATE ${SDC_TCL_INCLUDE})
  target_link_libraries(sdccore PUBLIC ${SDC_TCL_LIBS})
  target_compile_definitions(sdccore PRIVATE SDC_HAVE_TCL=1)
endif()

add_executable(sdclint app/sdclint_main.cpp)
target_link_libraries(sdclint PRIVATE sdccore)
target_include_directories(sdclint PRIVATE ${CMAKE_SOURCE_DIR}/hdl-core)  # header-only JsonWriter

# The ndjson server exposes the linter, so hdlcore depends on sdccore (declared above).
target_link_libraries(hdlcore PUBLIC sdccore)

# --- pad-core library: pad I/O -> boundary-scan config (celllib + slang netlist) ---
add_library(padcore STATIC
  pad-core/celllib.cpp
  pad-core/extract.cpp
  pad-core/table.cpp
  pad-core/gen.cpp)
target_include_directories(padcore
  PUBLIC ${CMAKE_SOURCE_DIR}/pad-core
  PRIVATE ${CMAKE_SOURCE_DIR}/hdl-core)
target_link_libraries(padcore PUBLIC hdlcore)

add_executable(pad app/pad_main.cpp)
target_link_libraries(pad PRIVATE padcore)

# --- tests ---
enable_testing()
add_subdirectory(test)
