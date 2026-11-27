# B's out-of-tree runner links only freshly built libraries from B's fixed snapshot.
cmake_minimum_required(VERSION 3.28)
project(BIndependentExprAPI LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
foreach(required HIER_CORE_ROOT HIER_CORE_BUILD HIER_CATCH_SOURCE)
  if(NOT DEFINED ${required})
    message(FATAL_ERROR "Set ${required} to B's fixed snapshot/build/source directory")
  endif()
endforeach()
option(B_SANITIZE "Link with B's ASan+UBSan libraries" OFF)
option(B_TEST_OBSERVER "B private observer oracle, requires freshly rebuilt ON product" OFF)
set(catch_suffix "")
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
  set(catch_suffix "d")
endif()
enable_testing()
foreach(pair "expr_library;M3ExprLibraryTest.cpp" "blackbox_loop;M3BlackboxLoopTest.cpp"
             "library_diagnostics;M3LibraryDiagnosticsTest.cpp" "lookup_increment;M3LookupIncrementTest.cpp"
             "library_open_probe;M3LibraryOpenProbe.cpp" "library_occurrence;M3LibraryOccurrenceTest.cpp"
             "step_increment;M3StepIncrementTest.cpp" "step_adapter;M3StepAdapterTest.cpp"
             "step_boundary;M3StepBoundaryTest.cpp" "trace_boundary;M3TraceBoundaryTest.cpp"
             "api;M3ApiTest.cpp" "source_increment;M3SourceIncrementTest.cpp"
             "source_physical;M3SourcePhysicalTest.cpp")
  list(GET pair 0 name)
  list(GET pair 1 source)
  add_executable(b_m3_${name} ../../unit/${source})
  target_compile_definitions(b_m3_${name} PRIVATE HIER_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/../../fixtures")
  target_include_directories(b_m3_${name} PRIVATE
    "${HIER_CORE_ROOT}/query/include" "${HIER_CORE_ROOT}/model/include")
  if(name STREQUAL "step_adapter")
    target_include_directories(b_m3_${name} PRIVATE "${HIER_CORE_ROOT}/db/include"
      "${HIER_CORE_ROOT}/frontend/include" "${HIER_CORE_ROOT}/query/src")
  endif()
  target_include_directories(b_m3_${name} SYSTEM PRIVATE
    "${HIER_CATCH_SOURCE}/src" "${HIER_CORE_BUILD}/_deps/catch2-build/generated-includes")
  target_compile_options(b_m3_${name} PRIVATE -Wall -Wextra -Wpedantic -Wconversion
    -Wsign-conversion -Wshadow -Wnon-virtual-dtor -Wold-style-cast -Wimplicit-fallthrough -Werror)
  if(B_SANITIZE)
    target_compile_options(b_m3_${name} PRIVATE -fsanitize=address,undefined -fno-omit-frame-pointer)
    target_link_options(b_m3_${name} PRIVATE -fsanitize=address,undefined)
  endif()
  target_link_libraries(b_m3_${name} PRIVATE
    "${HIER_CORE_BUILD}/libhiercore.a" "${HIER_CORE_BUILD}/libhier_db.a"
    "${HIER_CORE_BUILD}/libhier_frontend.a" "${HIER_CORE_BUILD}/_deps/slang-build/lib/libsvlang.a"
    "${HIER_CORE_BUILD}/_deps/catch2-build/src/libCatch2Main${catch_suffix}.a"
    "${HIER_CORE_BUILD}/_deps/catch2-build/src/libCatch2${catch_suffix}.a")
  if(name STREQUAL "library_open_probe")
    find_package(Python3 REQUIRED COMPONENTS Interpreter)
    add_test(NAME b_m3_library_open_scaling COMMAND ${Python3_EXECUTABLE}
      ${CMAKE_CURRENT_SOURCE_DIR}/../test_library_open_scaling.py)
    set_tests_properties(b_m3_library_open_scaling PROPERTIES TIMEOUT 240 RUN_SERIAL TRUE
      ENVIRONMENT "B_LIBRARY_OPEN_PROBE=$<TARGET_FILE:b_m3_library_open_probe>")
  else()
    add_test(NAME b_m3_${name} COMMAND b_m3_${name})
    set_tests_properties(b_m3_${name} PROPERTIES TIMEOUT 240 RUN_SERIAL TRUE)
  endif()
endforeach()
if(B_TEST_OBSERVER)
  add_library(b_observation_interface INTERFACE)
  target_include_directories(b_observation_interface INTERFACE "${HIER_CORE_ROOT}/observation")
  target_compile_definitions(b_observation_interface INTERFACE HIER_TEST_OBSERVER=1)
  foreach(pair "observer;M3ObserverTest.cpp" "source_sort;M3SourceSortTest.cpp")
  list(GET pair 0 name)
  list(GET pair 1 source)
  add_executable(b_m3_${name} ../../unit/${source})
  target_compile_definitions(b_m3_${name} PRIVATE HIER_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/../../fixtures")
  target_include_directories(b_m3_${name} PRIVATE "${HIER_CORE_ROOT}/query/include" "${HIER_CORE_ROOT}/model/include")
  target_include_directories(b_m3_${name} SYSTEM PRIVATE "${HIER_CATCH_SOURCE}/src" "${HIER_CORE_BUILD}/_deps/catch2-build/generated-includes")
  target_compile_options(b_m3_${name} PRIVATE -Wall -Wextra -Wpedantic -Wconversion -Wsign-conversion -Wshadow -Werror)
  target_link_libraries(b_m3_${name} PRIVATE b_observation_interface
    "${HIER_CORE_BUILD}/libhiercore.a" "${HIER_CORE_BUILD}/libhier_db.a"
    "${HIER_CORE_BUILD}/libhier_frontend.a" "${HIER_CORE_BUILD}/_deps/slang-build/lib/libsvlang.a"
    "${HIER_CORE_BUILD}/_deps/catch2-build/src/libCatch2Main${catch_suffix}.a"
    "${HIER_CORE_BUILD}/_deps/catch2-build/src/libCatch2${catch_suffix}.a")
  if(B_SANITIZE)
    target_compile_options(b_m3_${name} PRIVATE -fsanitize=address,undefined -fno-omit-frame-pointer)
    target_link_options(b_m3_${name} PRIVATE -fsanitize=address,undefined)
  endif()
  add_test(NAME b_m3_${name} COMMAND b_m3_${name})
  set_tests_properties(b_m3_${name} PROPERTIES TIMEOUT 600 RUN_SERIAL TRUE)
  endforeach()
endif()
