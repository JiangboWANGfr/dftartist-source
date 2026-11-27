add_executable(b_m4_reader_state private/ReaderDecodeTest.cpp private/SessionStateTest.cpp)
target_include_directories(b_m4_reader_state PRIVATE ../../protocol/src)
target_link_libraries(b_m4_reader_state PRIVATE hier_protocol hier_observation Catch2::Catch2WithMain hier_warnings)
target_compile_definitions(b_m4_reader_state PRIVATE HIER_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/../fixtures")
add_test(NAME b_m4_reader_state COMMAND b_m4_reader_state)
set_tests_properties(b_m4_reader_state PROPERTIES TIMEOUT 60 LABELS "M4")

add_executable(b_m4_worker private/SessionWorkerTest.cpp)
target_include_directories(b_m4_worker PRIVATE ../../protocol/src)
target_link_libraries(b_m4_worker PRIVATE hier_protocol hier_observation Catch2::Catch2WithMain hier_warnings)
target_compile_definitions(b_m4_worker PRIVATE HIER_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/../fixtures")
add_test(NAME b_m4_worker COMMAND b_m4_worker)
set_tests_properties(b_m4_worker PROPERTIES TIMEOUT 90 LABELS "M4")

add_library(b_m4_snapshot OBJECT SnapshotContract.cpp)
target_link_libraries(b_m4_snapshot PRIVATE hier_model hier_warnings)

add_executable(a_m4_schema_replay ../a_m4/SchemaReplay.cpp)
target_include_directories(a_m4_schema_replay PRIVATE ../../protocol/src)
target_link_libraries(a_m4_schema_replay PRIVATE hier_protocol hier_warnings)

add_executable(a_m4_core_boundary ../a_m4/CoreBoundaryTest.cpp)
target_include_directories(a_m4_core_boundary PRIVATE ../../protocol/src)
target_link_libraries(a_m4_core_boundary PRIVATE hier_protocol hier_observation Catch2::Catch2WithMain hier_warnings)
target_compile_definitions(a_m4_core_boundary PRIVATE HIER_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/../fixtures")
add_test(NAME a_m4_core_boundary COMMAND a_m4_core_boundary)
set_tests_properties(a_m4_core_boundary PROPERTIES TIMEOUT 60 LABELS "M4")

find_package(Python3 REQUIRED COMPONENTS Interpreter)
add_test(NAME a_m4_cpp_generated COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/../../../protocol/schema/scripts/generate_cpp.py --check)
set_tests_properties(a_m4_cpp_generated PROPERTIES LABELS "M4")
add_test(NAME a_m4_cpp_generator_guard COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/../../../protocol/schema/tests/test_cpp_generator.py)
set_tests_properties(a_m4_cpp_generator_guard PROPERTIES LABELS "M4")

add_test(NAME a_m4_stdio COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/../a_m4/test_stdio.py)
set_tests_properties(a_m4_stdio PROPERTIES ENVIRONMENT "HIER_BIN=$<TARGET_FILE:hier>" TIMEOUT 90 LABELS "M4")

# Independent replay uses the original B corpus and the production validators.
add_executable(b_m4_schema_replay BWireReplay.cpp)
target_include_directories(b_m4_schema_replay PRIVATE ../../protocol/src)
target_link_libraries(b_m4_schema_replay PRIVATE hier_protocol hier_warnings)
set(HIER_SCHEMA_PYTHON "${Python3_EXECUTABLE}" CACHE FILEPATH
  "Python interpreter with protocol/schema/tests/requirements.txt installed")
add_test(NAME b_m4_cpp_schema COMMAND "${HIER_SCHEMA_PYTHON}"
  ${CMAKE_CURRENT_SOURCE_DIR}/replay_cpp_schema.py $<TARGET_FILE:b_m4_schema_replay>
  ${PROJECT_SOURCE_DIR}/..)
set_tests_properties(b_m4_cpp_schema PROPERTIES TIMEOUT 60 LABELS "M4")

# A's wiring of B's independently frozen finite-byte decoder expectations.
add_executable(a_m4_decode_replay ../a_m4/DecodeReplay.cpp)
target_include_directories(a_m4_decode_replay PRIVATE ../../protocol/src)
target_link_libraries(a_m4_decode_replay PRIVATE hier_protocol hier_warnings)
add_test(NAME a_m4_frozen_raw_decoder COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/../a_m4/replay_decoder.py $<TARGET_FILE:a_m4_decode_replay>
  ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reader_raw.json)
set_tests_properties(a_m4_frozen_raw_decoder PROPERTIES TIMEOUT 60 LABELS "M4")

# B independently checks the fixture against its original input construction.
# This executes only the selected AST, without candidate-library dependencies.
add_test(NAME b_m4_raw65_projection COMMAND ${Python3_EXECUTABLE}
  ${CMAKE_CURRENT_SOURCE_DIR}/verify_raw65_projection.py
  ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/reader_raw.json)
set_tests_properties(b_m4_raw65_projection PROPERTIES TIMEOUT 60 LABELS "M4")
