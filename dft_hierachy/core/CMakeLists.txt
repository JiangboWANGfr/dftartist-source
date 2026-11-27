cmake_minimum_required(VERSION 3.28)
project(hier VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE RelWithDebInfo CACHE STRING "Build type" FORCE)
endif()

# Sanitizer builds instrument everything, slang included, so that container annotations
# agree across the whole program. Set before any target is created.
option(HIER_SANITIZE "Build with AddressSanitizer and UndefinedBehaviorSanitizer" OFF)
if(HIER_SANITIZE)
  add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer -fno-sanitize-recover=undefined)
  add_link_options(-fsanitize=address,undefined)
endif()

include(cmake/Slang.cmake)

# Warnings for this project's own code (not for slang or Catch2), treated as errors.
add_library(hier_warnings INTERFACE)
target_compile_options(hier_warnings INTERFACE
  -Wall -Wextra -Wpedantic -Wconversion -Wsign-conversion -Wshadow -Wnon-virtual-dtor
  -Wold-style-cast -Wimplicit-fallthrough -Werror)

option(HIER_TEST_OBSERVER "Enable private deterministic test observations (not a production API)" OFF)
add_library(hier_observation INTERFACE)
target_include_directories(hier_observation INTERFACE "${CMAKE_CURRENT_SOURCE_DIR}/observation")
if(HIER_TEST_OBSERVER)
  target_compile_definitions(hier_observation INTERFACE HIER_TEST_OBSERVER=1)
endif()

# Layering (docs/DESIGN.md 3.2, 3.3). Dependencies only point downwards, and ONLY
# hier_frontend can see slang's headers: it links slang PRIVATE, so no other target
# inherits slang's include directories. tests/layering proves the build enforces this.

# L0 model: pure data types
add_library(hier_model INTERFACE)
target_include_directories(hier_model INTERFACE model/include)

# L1 frontend: the only layer that touches slang
add_library(hier_frontend STATIC frontend/src/Frontend.cpp frontend/src/Connections.cpp
                                 frontend/src/Sources.cpp)
target_include_directories(hier_frontend PUBLIC frontend/include)
target_link_libraries(hier_frontend PUBLIC hier_model PRIVATE slang::slang hier_warnings)
target_compile_definitions(hier_frontend PRIVATE HIER_SLANG_SOURCE_ID="${HIER_SLANG_SOURCE_ID}")

# L2 db
add_library(hier_db STATIC db/src/DesignDb.cpp db/src/Occurrences.cpp db/src/ConnectionIndex.cpp
                           db/src/SourceIndex.cpp db/src/SourceBytes.cpp db/src/SnapshotMetadata.cpp)
target_include_directories(hier_db PUBLIC db/include)
target_link_libraries(hier_db PUBLIC hier_model hier_frontend PRIVATE hier_warnings hier_observation)

# L3 query: the kernel's real API (libhiercore)
add_library(hiercore STATIC query/src/Design.cpp query/src/Connectivity.cpp
                           query/src/Lookup.cpp query/src/HierarchyPath.cpp query/src/Step.cpp
                           query/src/Trace.cpp query/src/TraceGraph.cpp query/src/Source.cpp
                           query/src/Registers.cpp query/src/Signals.cpp query/src/InstanceQueries.cpp)
target_include_directories(hiercore PUBLIC query/include PRIVATE db/src)
target_link_libraries(hiercore PUBLIC hier_model PRIVATE hier_db hier_warnings hier_observation)

# L4 protocol + CLI
find_package(Threads REQUIRED)
add_library(hier_protocol STATIC protocol/src/Json.cpp protocol/src/FrameReader.cpp
                                protocol/src/DecodeFrame.cpp protocol/src/SessionState.cpp
                                protocol/src/SchemaPrimitives.cpp protocol/src/WireSchema.generated.cpp
                                protocol/src/Dispatch.cpp protocol/src/SessionWorker.cpp protocol/src/Serve.cpp)
target_include_directories(hier_protocol PUBLIC protocol/include)
target_link_libraries(hier_protocol PUBLIC hiercore PRIVATE hier_warnings hier_observation Threads::Threads)

add_library(hier_sharing_verify STATIC app/VerifySharing.cpp app/SharingReference.cpp)
target_link_libraries(hier_sharing_verify PUBLIC hier_protocol PRIVATE hier_warnings)

add_executable(hier app/main.cpp)
target_link_libraries(hier PRIVATE hier_sharing_verify hier_warnings)

enable_testing()
add_subdirectory(tests)

# M0 verification experiments (docs/DESIGN.md 9.1). Not part of the product layers:
# they link slang directly on purpose.
option(HIER_BUILD_EXPERIMENTS "Build the M0 verification experiments" ON)
if(HIER_BUILD_EXPERIMENTS)
  add_subdirectory(experiments)
endif()

# Optional domain consumers. Their DFT rules are not part of the generic Core API.
option(HIER_BUILD_ANALYSIS "Build standalone DFT analysis consumers" OFF)
if(HIER_BUILD_ANALYSIS)
  add_subdirectory(../analysis "${CMAKE_CURRENT_BINARY_DIR}/analysis")
endif()
