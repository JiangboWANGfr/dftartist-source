# M2 acceptance tests, written from docs/DESIGN.md without reading the implementation.
# They drive the command line only; hiercli.py turns its JSON into names and bits.
find_package(Python3 REQUIRED COMPONENTS Interpreter)

foreach(suite deps pins conn verify contract boundaries review_edges review_followup)
  add_test(NAME m2_${suite}
    COMMAND ${Python3_EXECUTABLE} -m unittest -v test_${suite}
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR})
  set_tests_properties(m2_${suite} PROPERTIES ENVIRONMENT "HIER_BIN=$<TARGET_FILE:hier>")
  set_tests_properties(m2_${suite} PROPERTIES TIMEOUT 180)
endforeach()

add_test(NAME m2_open_scaling COMMAND ${Python3_EXECUTABLE} -m unittest -v test_open_scaling
  WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR})
set_tests_properties(m2_open_scaling PROPERTIES
  ENVIRONMENT "HIER_BIN=$<TARGET_FILE:hier>" TIMEOUT 240 RUN_SERIAL TRUE)
