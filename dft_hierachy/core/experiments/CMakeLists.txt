# M0 verification experiments (docs/DESIGN.md 9.1). `hier_exp <subcommand> <slang args>`.
# Experiment code only: it links slang directly and is not part of the product layers.
add_executable(hier_exp Common.cpp Files.cpp Sharing.cpp Scale.cpp Facts.cpp main.cpp)
target_link_libraries(hier_exp PRIVATE slang::slang hier_warnings)

# The experiments that have a fixed expected outcome run as tests, so a slang upgrade
# that changes any of these behaviours is caught (docs/DESIGN.md 4.1, 9.1).
set(_fx ${CMAKE_SOURCE_DIR}/tests/fixtures)

# V1: instances slang groups under one canonical body are identical, including on the
# adversarial cases (upward names, defparam, bind, interface ports, hierarchical assign).
add_test(NAME exp_sharing_adversarial
  COMMAND hier_exp sharing ${_fx}/sharing/adversarial.sv --top top --error-limit 0)
set_tests_properties(exp_sharing_adversarial PROPERTIES
  PASS_REGULAR_EXPRESSION "\\[canonical\\] distinct bodies 26, instances sharing an earlier body 4, MISMATCHES 0")

# V7: every file the compile read is listed: nested includes and the -y library cell
# that is used, but not the library cell that is not.
add_test(NAME exp_files_closure
  COMMAND hier_exp files -F ${_fx}/inputs/design.f --top top)
set_tests_properties(exp_files_closure PROPERTIES
  PASS_REGULAR_EXPRESSION "defs\\.svh.*nested\\.svh.*lib_cell\\.v.*top\\.sv"
  FAIL_REGULAR_EXPRESSION "unused_cell")

# V6: flat bit numbering of ranges, structs and unpacked arrays.
add_test(NAME exp_bit_space
  COMMAND hier_exp drivers ${_fx}/bits/bits.sv --top top --error-limit 0)
set_tests_properties(exp_bit_space PROPERTIES
  PASS_REGULAR_EXPRESSION "writes up\\[3:0\\].*writes rev\\[7:4\\].*writes pk\\[3:0\\].*writes un\\[11:4\\].*writes arr\\[7:4\\].*writes arr\\[11:10\\].*writes mem\\[31:0\\]")

# V4: a driver that reaches into another body is recognisable.
add_test(NAME exp_cross_body_driver
  COMMAND hier_exp drivers ${_fx}/bits/bits.sv --top top --error-limit 0)
set_tests_properties(exp_cross_body_driver PROPERTIES
  PASS_REGULAR_EXPRESSION "drivers 31 \\(1 from another body\\)")

# The clock-path statistic counts what it claims to count.
add_test(NAME exp_clockstat_fixture
  COMMAND hier_exp clockstat ${_fx}/clockpath/selectors.sv --top top)
set_tests_properties(exp_clockstat_fixture PROPERTIES
  PASS_REGULAR_EXPRESSION "1  assign: gate.*1  assign: inverter.*2  assign: selector.*2  procedural block WITH if/case.*1  register output used as clock")
