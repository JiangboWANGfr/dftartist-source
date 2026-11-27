include(FetchContent)
FetchContent_Declare(
  Catch2
  GIT_REPOSITORY https://github.com/catchorg/Catch2.git
  GIT_TAG v3.7.1
  GIT_SHALLOW ON
  SYSTEM
)
FetchContent_MakeAvailable(Catch2)

# Unit tests against the kernel API (L3). Expectations are hand-written.
add_executable(hier_tests unit/NavTest.cpp unit/SharingGateTest.cpp unit/LifecycleTest.cpp)
target_link_libraries(hier_tests PRIVATE hier_protocol hier_frontend Catch2::Catch2WithMain hier_warnings)
target_compile_definitions(hier_tests PRIVATE HIER_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
add_test(NAME unit COMMAND hier_tests)

# A separate M2 public-API gate. M1 has no LibraryProvider/connection API and cannot
# build this target; that is an unmet milestone, never a skipped/passed test.
add_executable(b_review_api unit/BlackboxPositionTest.cpp)
target_link_libraries(b_review_api PRIVATE hier_protocol hier_frontend Catch2::Catch2WithMain hier_warnings)
target_compile_definitions(b_review_api PRIVATE HIER_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
add_test(NAME b_review_api COMMAND b_review_api)

add_executable(b_followup_api unit/ExternalDirectionTest.cpp)
target_link_libraries(b_followup_api PRIVATE hier_protocol hier_frontend Catch2::Catch2WithMain hier_warnings)
target_compile_definitions(b_followup_api PRIVATE HIER_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
add_test(NAME b_followup_api COMMAND b_followup_api)

# The build links exactly the slang that body sharing was verified for, and so may
# share bodies. If the pinned slang or its caching sources change, this fails until
# frontend/SHARING_VERIFIED.md and the verified identity are redone.
add_test(NAME cli_version COMMAND hier --version)
set_tests_properties(cli_version PROPERTIES
  PASS_REGULAR_EXPRESSION "\"version\":\"12\\.0\\.0\",\"sourceId\":\"07b9237d652d3a61abd674ae487791fcd97fc0b0a896a6c797b879f4620480db\"},\"bodySharing\":\"fast\"")

# docs/DESIGN.md 4.1: sharing a body between instances answers the same as extracting
# each instance on its own, on the fixtures built to break sharing.
foreach(fx nav/nav.sv sharing/adversarial.sv bits/bits.sv)
  string(REPLACE "/" "_" _name ${fx})
  add_test(NAME verify_sharing_${_name}
    COMMAND hier verify-sharing ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/${fx})
  set_tests_properties(verify_sharing_${_name} PROPERTIES
    PASS_REGULAR_EXPRESSION "different 0, failed queries 0")
endforeach()

# verify-sharing must not report success when there was nothing valid to compare. Each
# of these exits non-zero; WILL_FAIL makes that the expected outcome, and the companion
# test checks it failed for the stated reason rather than for some other one.
function(hier_verify_sharing_rejects name reason)
  add_test(NAME verify_sharing_rejects_${name} COMMAND hier verify-sharing ${ARGN})
  set_tests_properties(verify_sharing_rejects_${name} PROPERTIES WILL_FAIL TRUE)
  add_test(NAME verify_sharing_rejects_${name}_reason COMMAND hier verify-sharing ${ARGN})
  set_tests_properties(verify_sharing_rejects_${name}_reason PROPERTIES
    PASS_REGULAR_EXPRESSION "verify-sharing FAILED: ${reason}")
endfunction()
hier_verify_sharing_rejects(unknown_top "the design has 1 compile error"
  --top no_such_top ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/nav/nav.sv)
hier_verify_sharing_rejects(compile_error "the design has [0-9]+ compile error"
  ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/verify/broken.sv)
hier_verify_sharing_rejects(no_top "the design has no top instance"
  ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/verify/package_only.sv)

# Layering tests (docs/DESIGN.md 3.3). Each violation target includes a slang header
# from a layer that must not see slang; the test passes only if that build fails
# because the header cannot be found.
# layering_control includes the same header from the frontend and must build, which
# proves the failures are caused by layering and not by a broken include.
function(hier_layer_probe name layer)
  add_library(${name} OBJECT EXCLUDE_FROM_ALL layering/includes_slang.cpp)
  target_link_libraries(${name} PRIVATE ${layer})
  add_test(NAME ${name}
    COMMAND ${CMAKE_COMMAND} --build ${CMAKE_BINARY_DIR} --target ${name})
endfunction()

foreach(layer hier_model hier_db hiercore hier_protocol)
  hier_layer_probe(layering_violation_${layer} ${layer})
  # Must fail for this reason and no other: the layer cannot see slang's headers.
  set_tests_properties(layering_violation_${layer} PROPERTIES
    PASS_REGULAR_EXPRESSION "slang/ast/Compilation\\.h.*(file not found|No such file)")
endforeach()

add_library(layering_control OBJECT EXCLUDE_FROM_ALL layering/includes_slang.cpp)
target_link_libraries(layering_control PRIVATE slang::slang)
add_test(NAME layering_control
  COMMAND ${CMAKE_COMMAND} --build ${CMAKE_BINARY_DIR} --target layering_control)

# Sanitizer builds only: two programs with a deliberate bug each. They must be caught.
if(HIER_SANITIZE)
  add_executable(sanitize_use_after_free sanitize/use_after_free.cpp)
  add_test(NAME sanitizer_catches_use_after_free COMMAND sanitize_use_after_free)
  set_tests_properties(sanitizer_catches_use_after_free PROPERTIES
    ENVIRONMENT "ASAN_OPTIONS=abort_on_error=0"
    PASS_REGULAR_EXPRESSION "heap-use-after-free")

  add_executable(sanitize_signed_overflow sanitize/signed_overflow.cpp)
  add_test(NAME sanitizer_catches_signed_overflow COMMAND sanitize_signed_overflow)
  set_tests_properties(sanitizer_catches_signed_overflow PROPERTIES
    ENVIRONMENT "UBSAN_OPTIONS=abort_on_error=0"
    PASS_REGULAR_EXPRESSION "signed integer overflow")
endif()

# M2 acceptance tests through the command line (Agent B).
add_subdirectory(m2)

# M7's independent dynamic-write oracle uses the public API in all configurations.
add_subdirectory(m7)

# The production private reader/state is linked directly by B's frozen tests.
# The private include path and observer flag are never exported to consumers.
add_subdirectory(m4)

# M3 independent red gate. Explicit selection preserves the completed M2 baseline;
# when selected, absent APIs/commands MUST fail, never skip or expectedFailure.
option(HIER_TEST_M3 "Build/register Agent B's frozen M3 acceptance gate" ON)
if(HIER_TEST_M3)
  add_subdirectory(m3)
endif()

# M4 now has a real service. Keep the historical option name for existing builds;
# the standard check explicitly enables it even when an old cache says OFF.
option(HIER_TEST_FUTURE "Register M4 real-process acceptance tests" ON)
if(HIER_TEST_FUTURE)
  add_subdirectory(acceptance)
else()
  message(STATUS "Future M4+ tests not selected; use -DHIER_TEST_FUTURE=ON to register them")
endif()

# Agent A state/cache checks; B's frozen fixtures and assertions remain independent.
add_executable(hier_connection_state_tests a_m2/ConnectionStateTest.cpp)
target_link_libraries(hier_connection_state_tests PRIVATE hier_protocol hier_frontend Catch2::Catch2WithMain hier_warnings)
target_compile_definitions(hier_connection_state_tests PRIVATE HIER_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
add_test(NAME connection_state COMMAND hier_connection_state_tests)
add_executable(hier_expr_tests a_m3/ExprTest.cpp)
target_link_libraries(hier_expr_tests PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
target_compile_definitions(hier_expr_tests PRIVATE HIER_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
add_test(NAME a_m3_expr COMMAND hier_expr_tests)

add_executable(hier_lookup_tests a_m3/LookupTest.cpp)
target_link_libraries(hier_lookup_tests PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
target_compile_definitions(hier_lookup_tests PRIVATE HIER_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
add_test(NAME a_m3_lookup COMMAND hier_lookup_tests)

add_executable(hier_lookup_index_tests a_m3/LookupIndexTest.cpp)
target_link_libraries(hier_lookup_index_tests PRIVATE hier_db Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m3_lookup_index COMMAND hier_lookup_index_tests)

add_executable(hier_step_tests a_m3/StepTest.cpp)
target_link_libraries(hier_step_tests PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
target_compile_definitions(hier_step_tests PRIVATE HIER_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
add_test(NAME a_m3_step COMMAND hier_step_tests)
add_executable(hier_step_index_tests a_m3/StepIndexTest.cpp)
target_link_libraries(hier_step_index_tests PRIVATE hiercore Catch2::Catch2WithMain hier_warnings)
target_include_directories(hier_step_index_tests PRIVATE ../db/include ../frontend/include)
add_test(NAME a_m3_step_index COMMAND hier_step_index_tests)
add_executable(hier_trace_tests a_m3/TraceTest.cpp)
target_link_libraries(hier_trace_tests PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
target_compile_definitions(hier_trace_tests PRIVATE HIER_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures"
  A_TRACE_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/a_m3/fixtures/trace.sv")
add_test(NAME a_m3_trace COMMAND hier_trace_tests)
add_executable(hier_opaque_binding_tests a_m3/OpaqueBindingTest.cpp)
target_link_libraries(hier_opaque_binding_tests PRIVATE hiercore Catch2::Catch2WithMain hier_warnings)
target_compile_definitions(hier_opaque_binding_tests PRIVATE HIER_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures"
  A_OPAQUE_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/a_m3/fixtures/opaque_bindings.sv")
add_test(NAME a_m3_opaque_binding COMMAND hier_opaque_binding_tests)
find_package(Python3 REQUIRED COMPONENTS Interpreter)
add_test(NAME a_m2_review COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/a_m2/test_review.py)
set_tests_properties(a_m2_review PROPERTIES ENVIRONMENT "HIER_BIN=$<TARGET_FILE:hier>" TIMEOUT 180)
add_test(NAME a_m2_rereview COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/a_m2/test_rereview.py)
set_tests_properties(a_m2_rereview PROPERTIES ENVIRONMENT "HIER_BIN=$<TARGET_FILE:hier>" TIMEOUT 180)
if(UNIX)
  add_test(NAME a_m2_open_scaling COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/a_m2/open_scaling.py)
  set_tests_properties(a_m2_open_scaling PROPERTIES ENVIRONMENT "HIER_BIN=$<TARGET_FILE:hier>" TIMEOUT 180 RUN_SERIAL TRUE)
endif()

add_executable(hier_source_tests a_m3/SourceTest.cpp)
add_subdirectory(source-ref-kind)
target_link_libraries(hier_source_tests PRIVATE hiercore hier_db Catch2::Catch2WithMain hier_warnings)
target_compile_definitions(hier_source_tests PRIVATE
  A_SOURCE_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/a_m3/fixtures/source_edges.sv")
add_test(NAME a_m3_source COMMAND hier_source_tests)

if(HIER_TEST_OBSERVER)
  add_executable(hier_observation_tests a_m3/ObservationTest.cpp)
  target_link_libraries(hier_observation_tests PRIVATE hiercore hier_observation Catch2::Catch2WithMain hier_warnings)
  target_compile_definitions(hier_observation_tests PRIVATE HIER_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures"
    A_SOURCE_BULK_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/a_m3/fixtures/source_bulk.sv")
  add_test(NAME a_m3_observation COMMAND hier_observation_tests)
endif()
