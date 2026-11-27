find_package(Python3 REQUIRED COMPONENTS Interpreter)
add_test(NAME m4_protocol
  COMMAND ${Python3_EXECUTABLE} -m unittest -v test_protocol test_protocol_boundaries
  WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR})
set_tests_properties(m4_protocol PROPERTIES
  ENVIRONMENT "HIER_BIN=$<TARGET_FILE:hier>" TIMEOUT 180 LABELS "future;M4")

add_test(NAME b_m4_review_wire_eof
  COMMAND ${Python3_EXECUTABLE} -B -m unittest -v test_review_wire_eof
  WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR})
set_tests_properties(b_m4_review_wire_eof PROPERTIES
  ENVIRONMENT "HIER_BIN=$<TARGET_FILE:hier>" TIMEOUT 180 LABELS "M4")
