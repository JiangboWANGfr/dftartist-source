# B's frozen oracle and public adapter stay in their original location.
add_executable(a_m7_source_groups "${PROJECT_SOURCE_DIR}/tests/a_m7/SourceGroupsTest.cpp")
target_include_directories(a_m7_source_groups PRIVATE "${PROJECT_SOURCE_DIR}/db/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_link_libraries(a_m7_source_groups PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_source_groups COMMAND a_m7_source_groups)
set_tests_properties(a_m7_source_groups PROPERTIES TIMEOUT 180)

add_executable(a_m7_source_lines "${PROJECT_SOURCE_DIR}/tests/a_m7/SourceLinesTest.cpp")
target_include_directories(a_m7_source_lines PRIVATE "${PROJECT_SOURCE_DIR}/db/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_link_libraries(a_m7_source_lines PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_source_lines COMMAND a_m7_source_lines)
set_tests_properties(a_m7_source_lines PROPERTIES TIMEOUT 180)

add_executable(a_m7_source_utf8 "${PROJECT_SOURCE_DIR}/tests/a_m7/SourceUtf8Test.cpp")
target_include_directories(a_m7_source_utf8 PRIVATE "${PROJECT_SOURCE_DIR}/db/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_link_libraries(a_m7_source_utf8 PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_source_utf8 COMMAND a_m7_source_utf8)
set_tests_properties(a_m7_source_utf8 PROPERTIES TIMEOUT 180)

add_executable(a_m7_source_hashing "${PROJECT_SOURCE_DIR}/tests/a_m7/SourceHashingTest.cpp")
target_include_directories(a_m7_source_hashing PRIVATE "${PROJECT_SOURCE_DIR}/db/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_link_libraries(a_m7_source_hashing PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_source_hashing COMMAND a_m7_source_hashing)
set_tests_properties(a_m7_source_hashing PROPERTIES TIMEOUT 180)

add_executable(a_m7_register_traversal "${PROJECT_SOURCE_DIR}/tests/a_m7/RegisterTraversalTest.cpp")
target_include_directories(a_m7_register_traversal PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_link_libraries(a_m7_register_traversal PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_register_traversal COMMAND a_m7_register_traversal)
set_tests_properties(a_m7_register_traversal PROPERTIES TIMEOUT 180)

add_executable(a_m7_partial_reasons "${PROJECT_SOURCE_DIR}/tests/a_m7/PartialReasonsTest.cpp")
target_include_directories(a_m7_partial_reasons PRIVATE "${PROJECT_SOURCE_DIR}/query/src")
target_link_libraries(a_m7_partial_reasons PRIVATE hier_model Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_partial_reasons COMMAND a_m7_partial_reasons)
set_tests_properties(a_m7_partial_reasons PROPERTIES TIMEOUT 180)

# Build the adapter against this configuration, including sanitizer flags.
find_package(Python3 REQUIRED COMPONENTS Interpreter)
set(m7_tests "${PROJECT_SOURCE_DIR}/../web/tests/independent-m7")
get_filename_component(m7_product "${PROJECT_SOURCE_DIR}/.." ABSOLUTE)

add_executable(b_m7_write_dump "${m7_tests}/dump-writes.cpp")
target_link_libraries(b_m7_write_dump PRIVATE hier_protocol hier_warnings)
add_test(NAME b_m7_dynamic_writes
  COMMAND ${Python3_EXECUTABLE} "${m7_tests}/dynamic-writes.py")
set_tests_properties(b_m7_dynamic_writes PROPERTIES
  TIMEOUT 180
  ENVIRONMENT "HIER_B_PRODUCT_ROOT=${m7_product};HIER_BIN=$<TARGET_FILE:hier>;HIER_B_WRITE_DUMP=$<TARGET_FILE:b_m7_write_dump>")

add_test(NAME a_m7_comparison_cache
  COMMAND ${Python3_EXECUTABLE} "${PROJECT_SOURCE_DIR}/tests/a_m7/test_comparison_cache.py")
set_tests_properties(a_m7_comparison_cache PROPERTIES
  TIMEOUT 180 ENVIRONMENT "HIER_BIN=$<TARGET_FILE:hier>")

add_test(NAME b_m7_comparison_cache
  COMMAND ${Python3_EXECUTABLE} "${PROJECT_SOURCE_DIR}/tests/a_m7/run_comparison_cache.py"
    "${m7_tests}/comparison-cache.py" "${CMAKE_CURRENT_BINARY_DIR}")
set_tests_properties(b_m7_comparison_cache PROPERTIES
  TIMEOUT 180 ENVIRONMENT "HIER_BIN=$<TARGET_FILE:hier>;HIER_B_PRODUCT_ROOT=${m7_product}")

# Dependency regression only: the production layering still exposes Slang at L1.
add_executable(a_m7_driver_probe "${PROJECT_SOURCE_DIR}/tests/a_m7/driver_probe.cpp")
target_link_libraries(a_m7_driver_probe PRIVATE slang::slang hier_warnings)
add_test(NAME a_m7_driver_tracking
  COMMAND ${Python3_EXECUTABLE} "${PROJECT_SOURCE_DIR}/tests/a_m7/test_driver_tracking.py"
    $<TARGET_FILE:a_m7_driver_probe>)
set_tests_properties(a_m7_driver_tracking PROPERTIES TIMEOUT 180)

add_test(NAME a_m7_driver_overlay_guard
  COMMAND ${Python3_EXECUTABLE} "${PROJECT_SOURCE_DIR}/tests/a_m7/test_driver_overlay_guard.py"
    "${CMAKE_COMMAND}" "${slang_SOURCE_DIR}")
set_tests_properties(a_m7_driver_overlay_guard PROPERTIES TIMEOUT 60)

add_executable(a_m7_binding_dump "${PROJECT_SOURCE_DIR}/tests/a_m7/binding_dump.cpp")
# Protocol already links L1 transitively. Expose the L1 header to this test-only
# consumer without linking the same static library twice (Apple ld warns on that).
target_include_directories(a_m7_binding_dump PRIVATE
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_link_libraries(a_m7_binding_dump PRIVATE hier_protocol hier_warnings)
add_test(NAME a_m7_binding_schedule
  COMMAND ${Python3_EXECUTABLE} "${PROJECT_SOURCE_DIR}/tests/a_m7/test_binding_schedule.py"
    $<TARGET_FILE:a_m7_binding_dump>)
set_tests_properties(a_m7_binding_schedule PROPERTIES TIMEOUT 180)

add_test(NAME a_m7_port_association
  COMMAND ${Python3_EXECUTABLE} "${PROJECT_SOURCE_DIR}/tests/a_m7/test_port_association.py"
    $<TARGET_FILE:a_m7_binding_dump>)
set_tests_properties(a_m7_port_association PROPERTIES TIMEOUT 180)

add_executable(a_m7_port_sources "${PROJECT_SOURCE_DIR}/tests/a_m7/PortConnectionSourcesTest.cpp")
target_include_directories(a_m7_port_sources PRIVATE "${PROJECT_SOURCE_DIR}/frontend/src")
target_link_libraries(a_m7_port_sources PRIVATE hier_frontend slang::slang Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_port_sources COMMAND a_m7_port_sources)

add_executable(a_m7_sharing_reference "${PROJECT_SOURCE_DIR}/tests/a_m7/SharingReferenceTest.cpp")
target_include_directories(a_m7_sharing_reference PRIVATE "${PROJECT_SOURCE_DIR}/app")
target_link_libraries(a_m7_sharing_reference PRIVATE hier_sharing_verify Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_sharing_reference COMMAND a_m7_sharing_reference)
set_tests_properties(a_m7_sharing_reference PROPERTIES TIMEOUT 180)

add_executable(a_m7_write_intervals "${PROJECT_SOURCE_DIR}/tests/a_m7/WriteIntervalsTest.cpp")
target_include_directories(a_m7_write_intervals PRIVATE "${PROJECT_SOURCE_DIR}/frontend/src")
target_link_libraries(a_m7_write_intervals PRIVATE hier_model Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_write_intervals COMMAND a_m7_write_intervals)
set_tests_properties(a_m7_write_intervals PROPERTIES TIMEOUT 180)

add_executable(a_m7_async_write_types "${PROJECT_SOURCE_DIR}/tests/a_m7/AsyncWriteTypesTest.cpp")
target_include_directories(a_m7_async_write_types PRIVATE "${PROJECT_SOURCE_DIR}/frontend/src")
target_link_libraries(a_m7_async_write_types PRIVATE hier_model Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_async_write_types COMMAND a_m7_async_write_types)
set_tests_properties(a_m7_async_write_types PROPERTIES TIMEOUT 180)

add_executable(a_m7_dependency_bits "${PROJECT_SOURCE_DIR}/tests/a_m7/DependencyBitsTest.cpp")
target_include_directories(a_m7_dependency_bits PRIVATE "${PROJECT_SOURCE_DIR}/frontend/src")
target_link_libraries(a_m7_dependency_bits PRIVATE hier_model Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_dependency_bits COMMAND a_m7_dependency_bits)
set_tests_properties(a_m7_dependency_bits PROPERTIES TIMEOUT 180)

add_executable(a_m7_static_connection_bits "${PROJECT_SOURCE_DIR}/tests/a_m7/StaticConnectionBitsTest.cpp")
target_include_directories(a_m7_static_connection_bits PRIVATE "${PROJECT_SOURCE_DIR}/frontend/src")
target_link_libraries(a_m7_static_connection_bits PRIVATE hier_model Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_static_connection_bits COMMAND a_m7_static_connection_bits)
set_tests_properties(a_m7_static_connection_bits PROPERTIES TIMEOUT 180)

add_executable(a_m7_dependency_union "${PROJECT_SOURCE_DIR}/tests/a_m7/DependencyUnionTest.cpp")
target_include_directories(a_m7_dependency_union PRIVATE "${PROJECT_SOURCE_DIR}/frontend/src")
target_link_libraries(a_m7_dependency_union PRIVATE hier_model Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_dependency_union COMMAND a_m7_dependency_union)
set_tests_properties(a_m7_dependency_union PROPERTIES TIMEOUT 180)

add_executable(a_m7_endpoint_accumulator "${PROJECT_SOURCE_DIR}/tests/a_m7/EndpointAccumulatorTest.cpp")
target_include_directories(a_m7_endpoint_accumulator PRIVATE "${PROJECT_SOURCE_DIR}/query/src")
target_compile_definitions(a_m7_endpoint_accumulator PRIVATE
  HIER_ENDPOINT_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/a_m7/endpoint-fanout.sv")
target_link_libraries(a_m7_endpoint_accumulator PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_endpoint_accumulator COMMAND a_m7_endpoint_accumulator)
set_tests_properties(a_m7_endpoint_accumulator PROPERTIES TIMEOUT 180)

add_executable(a_m7_connection_query_dump "${PROJECT_SOURCE_DIR}/tests/a_m7/connection_query_dump.cpp")
target_link_libraries(a_m7_connection_query_dump PRIVATE hier_protocol hier_warnings)

add_executable(a_m7_connection_snapshot "${PROJECT_SOURCE_DIR}/tests/a_m7/ConnectionSnapshotTest.cpp")
target_include_directories(a_m7_connection_snapshot PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_connection_snapshot PRIVATE
  HIER_SNAPSHOT_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/a_m7/endpoint-fanout.sv")
target_link_libraries(a_m7_connection_snapshot PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_connection_snapshot COMMAND a_m7_connection_snapshot)
set_tests_properties(a_m7_connection_snapshot PROPERTIES TIMEOUT 180)

add_executable(a_m7_port_segment_window "${PROJECT_SOURCE_DIR}/tests/a_m7/PortSegmentWindowTest.cpp")
target_include_directories(a_m7_port_segment_window PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_port_segment_window PRIVATE
  HIER_PORT_WINDOW_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/a_m7/port-segment-window.sv")
target_link_libraries(a_m7_port_segment_window PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_port_segment_window COMMAND a_m7_port_segment_window)
set_tests_properties(a_m7_port_segment_window PROPERTIES TIMEOUT 180)

add_executable(a_m7_canonical_query_ports "${PROJECT_SOURCE_DIR}/tests/a_m7/CanonicalQueryPortsTest.cpp")
target_include_directories(a_m7_canonical_query_ports PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_link_libraries(a_m7_canonical_query_ports PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_canonical_query_ports COMMAND a_m7_canonical_query_ports)
set_tests_properties(a_m7_canonical_query_ports PROPERTIES TIMEOUT 180)

add_executable(a_m7_query_instance_kinds "${PROJECT_SOURCE_DIR}/tests/a_m7/QueryInstanceKindsTest.cpp")
target_include_directories(a_m7_query_instance_kinds PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_link_libraries(a_m7_query_instance_kinds PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_query_instance_kinds COMMAND a_m7_query_instance_kinds)
set_tests_properties(a_m7_query_instance_kinds PROPERTIES TIMEOUT 180)

add_executable(a_m7_procedure_analysis_lookup "${PROJECT_SOURCE_DIR}/tests/a_m7/ProcedureAnalysisLookupTest.cpp")
target_include_directories(a_m7_procedure_analysis_lookup PRIVATE "${PROJECT_SOURCE_DIR}/frontend/src")
target_link_libraries(a_m7_procedure_analysis_lookup PRIVATE slang::slang Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_procedure_analysis_lookup COMMAND a_m7_procedure_analysis_lookup)
set_tests_properties(a_m7_procedure_analysis_lookup PROPERTIES TIMEOUT 180)
add_test(NAME a_m7_procedure_analysis_facts
  COMMAND ${Python3_EXECUTABLE} "${PROJECT_SOURCE_DIR}/tests/a_m7/test_procedure_analysis_lookup.py"
    $<TARGET_FILE:a_m7_binding_dump>)
set_tests_properties(a_m7_procedure_analysis_facts PROPERTIES TIMEOUT 180)

add_executable(a_m7_expression_target_projection "${PROJECT_SOURCE_DIR}/tests/a_m7/ExpressionTargetProjectionTest.cpp")
target_include_directories(a_m7_expression_target_projection PRIVATE "${PROJECT_SOURCE_DIR}/frontend/src")
target_link_libraries(a_m7_expression_target_projection PRIVATE hier_model Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_expression_target_projection COMMAND a_m7_expression_target_projection)
set_tests_properties(a_m7_expression_target_projection PROPERTIES TIMEOUT 180)
add_test(NAME a_m7_expression_target_facts
  COMMAND ${Python3_EXECUTABLE} "${PROJECT_SOURCE_DIR}/tests/a_m7/test_expression_target_projection.py"
    $<TARGET_FILE:a_m7_binding_dump>)
set_tests_properties(a_m7_expression_target_facts PROPERTIES TIMEOUT 180)

add_executable(a_m7_analysis_slot_routing "${PROJECT_SOURCE_DIR}/tests/a_m7/AnalysisSlotRoutingTest.cpp")
target_include_directories(a_m7_analysis_slot_routing PRIVATE "${PROJECT_SOURCE_DIR}/frontend/src"
  "$<TARGET_PROPERTY:hier_model,INTERFACE_INCLUDE_DIRECTORIES>")
target_link_libraries(a_m7_analysis_slot_routing PRIVATE slang::slang Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_analysis_slot_routing COMMAND a_m7_analysis_slot_routing)
set_tests_properties(a_m7_analysis_slot_routing PROPERTIES TIMEOUT 180)
add_test(NAME a_m7_analysis_slot_facts
  COMMAND ${Python3_EXECUTABLE} "${PROJECT_SOURCE_DIR}/tests/a_m7/test_analysis_slot_routing.py"
    $<TARGET_FILE:a_m7_binding_dump>)
set_tests_properties(a_m7_analysis_slot_facts PROPERTIES TIMEOUT 180)

add_executable(a_m7_analysis_routing_order "${PROJECT_SOURCE_DIR}/tests/a_m7/AnalysisRoutingOrderTest.cpp")
target_include_directories(a_m7_analysis_routing_order PRIVATE
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_analysis_routing_order PRIVATE
  HIER_ANALYSIS_ROUTING_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/a_m7/analysis-slot-routing.sv")
target_link_libraries(a_m7_analysis_routing_order PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_analysis_routing_order COMMAND a_m7_analysis_routing_order)
set_tests_properties(a_m7_analysis_routing_order PROPERTIES TIMEOUT 180)

add_executable(a_m7_occurrence_ports "${PROJECT_SOURCE_DIR}/tests/a_m7/OccurrencePortsTest.cpp")
target_include_directories(a_m7_occurrence_ports PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_occurrence_ports PRIVATE
  HIER_OCCURRENCE_PORTS_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/a_m7/occurrence-ports.sv")
target_link_libraries(a_m7_occurrence_ports PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_occurrence_ports COMMAND a_m7_occurrence_ports)
set_tests_properties(a_m7_occurrence_ports PROPERTIES TIMEOUT 180)

add_executable(a_m7_register_partitions "${PROJECT_SOURCE_DIR}/tests/a_m7/RegisterPartitionTest.cpp")
target_include_directories(a_m7_register_partitions PRIVATE "${PROJECT_SOURCE_DIR}/db/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_register_partitions PRIVATE
  HIER_REGISTER_PARTITION_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/a_m7/register-partitions.sv")
target_link_libraries(a_m7_register_partitions PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_register_partitions COMMAND a_m7_register_partitions)
set_tests_properties(a_m7_register_partitions PROPERTIES TIMEOUT 180)

add_executable(a_m7_register_pages "${PROJECT_SOURCE_DIR}/tests/a_m7/RegisterPagesTest.cpp")
target_include_directories(a_m7_register_pages PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_register_pages PRIVATE
  HIER_REGISTER_PAGES_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/a_m7/register-partitions.sv")
target_link_libraries(a_m7_register_pages PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_register_pages COMMAND a_m7_register_pages)
set_tests_properties(a_m7_register_pages PROPERTIES TIMEOUT 180)

add_executable(a_m7_search_projection "${PROJECT_SOURCE_DIR}/tests/a_m7/SearchProjectionTest.cpp")
target_include_directories(a_m7_search_projection PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_search_projection PRIVATE
  HIER_SEARCH_PROJECTION_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/m3/lookup.sv")
target_link_libraries(a_m7_search_projection PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_search_projection COMMAND a_m7_search_projection)
set_tests_properties(a_m7_search_projection PROPERTIES TIMEOUT 180)

add_executable(a_m7_connection_references "${PROJECT_SOURCE_DIR}/tests/a_m7/ConnectionReferenceIndexTest.cpp")
target_include_directories(a_m7_connection_references PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_connection_references PRIVATE
  HIER_CONNECTION_REFERENCES_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/a_m7/connection-references.sv")
target_link_libraries(a_m7_connection_references PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_connection_references COMMAND a_m7_connection_references)
set_tests_properties(a_m7_connection_references PROPERTIES TIMEOUT 180)

add_executable(a_m7_instance_descriptions "${PROJECT_SOURCE_DIR}/tests/a_m7/InstanceDescriptionsTest.cpp")
target_include_directories(a_m7_instance_descriptions PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_instance_descriptions PRIVATE
  HIER_INSTANCE_DESCRIPTIONS_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/nav/nav.sv")
target_link_libraries(a_m7_instance_descriptions PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_instance_descriptions COMMAND a_m7_instance_descriptions)
set_tests_properties(a_m7_instance_descriptions PROPERTIES TIMEOUT 180)

add_executable(a_m7_signal_pages "${PROJECT_SOURCE_DIR}/tests/a_m7/SignalPagesTest.cpp")
target_include_directories(a_m7_signal_pages PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_signal_pages PRIVATE
  HIER_SIGNAL_PAGES_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/a_m7/signal-pages.sv")
target_link_libraries(a_m7_signal_pages PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_signal_pages COMMAND a_m7_signal_pages)
set_tests_properties(a_m7_signal_pages PROPERTIES TIMEOUT 180)

add_executable(a_m7_path_matching "${PROJECT_SOURCE_DIR}/tests/a_m7/PathMatchingTest.cpp")
target_include_directories(a_m7_path_matching PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_path_matching PRIVATE
  HIER_PATH_MATCHING_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/m3/lookup.sv")
target_link_libraries(a_m7_path_matching PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_path_matching COMMAND a_m7_path_matching)
set_tests_properties(a_m7_path_matching PROPERTIES TIMEOUT 180)

add_executable(a_m7_source_range_window "${PROJECT_SOURCE_DIR}/tests/a_m7/SourceRangeWindowTest.cpp")
target_include_directories(a_m7_source_range_window PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_link_libraries(a_m7_source_range_window PRIVATE hier_protocol hier_observation Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_source_range_window COMMAND a_m7_source_range_window)
set_tests_properties(a_m7_source_range_window PROPERTIES TIMEOUT 180)

add_executable(a_m7_instance_property_queries "${PROJECT_SOURCE_DIR}/tests/a_m7/InstancePropertyQueriesTest.cpp")
target_include_directories(a_m7_instance_property_queries PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_link_libraries(a_m7_instance_property_queries PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_instance_property_queries COMMAND a_m7_instance_property_queries)
set_tests_properties(a_m7_instance_property_queries PROPERTIES TIMEOUT 180)

add_executable(a_m7_connection_coverage "${PROJECT_SOURCE_DIR}/tests/a_m7/ConnectionCoverageTest.cpp")
target_include_directories(a_m7_connection_coverage PRIVATE "${PROJECT_SOURCE_DIR}/db/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_link_libraries(a_m7_connection_coverage PRIVATE hier_protocol hier_observation Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_connection_coverage COMMAND a_m7_connection_coverage)
set_tests_properties(a_m7_connection_coverage PROPERTIES TIMEOUT 180)

if(HIER_TEST_OBSERVER)
  add_executable(a_m7_step_cancellation "${PROJECT_SOURCE_DIR}/tests/a_m7/StepCancellationTest.cpp")
  target_include_directories(a_m7_step_cancellation PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
    "${PROJECT_SOURCE_DIR}/protocol/src"
    "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
    "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
  target_compile_definitions(a_m7_step_cancellation PRIVATE HIER_FIXTURES="${PROJECT_SOURCE_DIR}/tests/fixtures")
  target_link_libraries(a_m7_step_cancellation PRIVATE hier_protocol hier_observation Catch2::Catch2WithMain hier_warnings)
  add_test(NAME a_m7_step_cancellation COMMAND a_m7_step_cancellation)
  set_tests_properties(a_m7_step_cancellation PROPERTIES TIMEOUT 120 RUN_SERIAL TRUE)
endif()

add_executable(a_m7_reference_projection "${PROJECT_SOURCE_DIR}/tests/a_m7/ReferenceProjectionTest.cpp")
target_include_directories(a_m7_reference_projection PRIVATE "${PROJECT_SOURCE_DIR}/query/src")
target_link_libraries(a_m7_reference_projection PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_reference_projection COMMAND a_m7_reference_projection)
set_tests_properties(a_m7_reference_projection PROPERTIES TIMEOUT 180)

add_executable(a_m7_search_path_matching "${PROJECT_SOURCE_DIR}/tests/a_m7/SearchPathMatchingTest.cpp")
target_include_directories(a_m7_search_path_matching PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_search_path_matching PRIVATE
  HIER_SEARCH_PATH_MATCHING_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/m3/lookup.sv")
target_link_libraries(a_m7_search_path_matching PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_search_path_matching COMMAND a_m7_search_path_matching)
set_tests_properties(a_m7_search_path_matching PROPERTIES TIMEOUT 180)

add_executable(a_m7_query_reference_scopes "${PROJECT_SOURCE_DIR}/tests/a_m7/QueryReferenceScopesTest.cpp")
target_include_directories(a_m7_query_reference_scopes PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_query_reference_scopes PRIVATE
  HIER_QUERY_REFERENCE_SCOPES_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/a_m7/query-reference-scopes.sv")
target_link_libraries(a_m7_query_reference_scopes PRIVATE hier_protocol hier_observation Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_query_reference_scopes COMMAND a_m7_query_reference_scopes)
set_tests_properties(a_m7_query_reference_scopes PROPERTIES TIMEOUT 180)

add_executable(a_m7_slot_path_prefix "${PROJECT_SOURCE_DIR}/tests/a_m7/SlotPathPrefixTest.cpp")
target_include_directories(a_m7_slot_path_prefix PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_slot_path_prefix PRIVATE
  HIER_SLOT_PATH_PREFIX_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/m3/lookup.sv")
target_link_libraries(a_m7_slot_path_prefix PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_slot_path_prefix COMMAND a_m7_slot_path_prefix)
set_tests_properties(a_m7_slot_path_prefix PROPERTIES TIMEOUT 180)

add_executable(a_m7_path_candidate_scan "${PROJECT_SOURCE_DIR}/tests/a_m7/PathCandidateScanTest.cpp")
target_include_directories(a_m7_path_candidate_scan PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_path_candidate_scan PRIVATE
  HIER_PATH_CANDIDATE_SCAN_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/m3/lookup.sv")
target_link_libraries(a_m7_path_candidate_scan PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_path_candidate_scan COMMAND a_m7_path_candidate_scan)
set_tests_properties(a_m7_path_candidate_scan PROPERTIES TIMEOUT 180)

add_executable(a_m7_path_slot_dispatch "${PROJECT_SOURCE_DIR}/tests/a_m7/PathSlotDispatchTest.cpp")
target_include_directories(a_m7_path_slot_dispatch PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_path_slot_dispatch PRIVATE
  HIER_PATH_SLOT_DISPATCH_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/m3/lookup.sv")
target_link_libraries(a_m7_path_slot_dispatch PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_path_slot_dispatch COMMAND a_m7_path_slot_dispatch)
set_tests_properties(a_m7_path_slot_dispatch PROPERTIES TIMEOUT 180)

add_executable(a_m7_signal_path_prefix "${PROJECT_SOURCE_DIR}/tests/a_m7/SignalPathPrefixTest.cpp")
target_include_directories(a_m7_signal_path_prefix PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_signal_path_prefix PRIVATE
  HIER_SIGNAL_PATH_PREFIX_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/m3/lookup.sv")
target_link_libraries(a_m7_signal_path_prefix PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_signal_path_prefix COMMAND a_m7_signal_path_prefix)
set_tests_properties(a_m7_signal_path_prefix PROPERTIES TIMEOUT 180)

add_executable(a_m7_signal_path_dispatch "${PROJECT_SOURCE_DIR}/tests/a_m7/SignalPathDispatchTest.cpp")
target_include_directories(a_m7_signal_path_dispatch PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_link_libraries(a_m7_signal_path_dispatch PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_signal_path_dispatch COMMAND a_m7_signal_path_dispatch)
set_tests_properties(a_m7_signal_path_dispatch PROPERTIES TIMEOUT 180)

add_executable(a_m7_signal_prefix_promotion "${PROJECT_SOURCE_DIR}/tests/a_m7/SignalPrefixPromotionTest.cpp")
target_include_directories(a_m7_signal_prefix_promotion PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_link_libraries(a_m7_signal_prefix_promotion PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_signal_prefix_promotion COMMAND a_m7_signal_prefix_promotion)
set_tests_properties(a_m7_signal_prefix_promotion PROPERTIES TIMEOUT 180)

add_executable(a_m7_search_signal_validation "${PROJECT_SOURCE_DIR}/tests/a_m7/SearchSignalValidationTest.cpp")
target_include_directories(a_m7_search_signal_validation PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_search_signal_validation PRIVATE
  HIER_SEARCH_SIGNAL_VALIDATION_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/m3/lookup.sv")
target_link_libraries(a_m7_search_signal_validation PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_search_signal_validation COMMAND a_m7_search_signal_validation)
set_tests_properties(a_m7_search_signal_validation PROPERTIES TIMEOUT 180)

add_executable(a_m7_signal_path_validation "${PROJECT_SOURCE_DIR}/tests/a_m7/SignalPathValidationTest.cpp")
target_include_directories(a_m7_signal_path_validation PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_signal_path_validation PRIVATE
  HIER_SIGNAL_PATH_VALIDATION_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/m3/lookup.sv")
target_link_libraries(a_m7_signal_path_validation PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_signal_path_validation COMMAND a_m7_signal_path_validation)
set_tests_properties(a_m7_signal_path_validation PROPERTIES TIMEOUT 180)

add_executable(a_m7_path_validation_tails "${PROJECT_SOURCE_DIR}/tests/a_m7/PathValidationTailsTest.cpp")
target_include_directories(a_m7_path_validation_tails PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_path_validation_tails PRIVATE
  HIER_PATH_VALIDATION_TAILS_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/a_m7/path-validation-tails.sv")
target_link_libraries(a_m7_path_validation_tails PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_path_validation_tails COMMAND a_m7_path_validation_tails)
set_tests_properties(a_m7_path_validation_tails PROPERTIES TIMEOUT 180)

add_executable(a_m7_path_partial_tails "${PROJECT_SOURCE_DIR}/tests/a_m7/PathPartialTailsTest.cpp")
target_include_directories(a_m7_path_partial_tails PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_path_partial_tails PRIVATE
  HIER_PATH_PARTIAL_TAILS_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/a_m7/path-partial-tails.sv")
target_link_libraries(a_m7_path_partial_tails PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_path_partial_tails COMMAND a_m7_path_partial_tails)
set_tests_properties(a_m7_path_partial_tails PROPERTIES TIMEOUT 180)

add_executable(a_m7_syntax_dispatch "${PROJECT_SOURCE_DIR}/tests/a_m7/SyntaxDispatchTest.cpp")
target_include_directories(a_m7_syntax_dispatch PRIVATE "${PROJECT_SOURCE_DIR}/query/src")
target_compile_definitions(a_m7_syntax_dispatch PRIVATE
  HIER_SYNTAX_DISPATCH_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/m3/lookup.sv")
target_link_libraries(a_m7_syntax_dispatch PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_syntax_dispatch COMMAND a_m7_syntax_dispatch)
set_tests_properties(a_m7_syntax_dispatch PROPERTIES TIMEOUT 180)

add_executable(a_m7_search_display_path "${PROJECT_SOURCE_DIR}/tests/a_m7/DisplayPathTest.cpp")
target_include_directories(a_m7_search_display_path PRIVATE "${PROJECT_SOURCE_DIR}/query/src"
  "$<TARGET_PROPERTY:hier_db,INTERFACE_INCLUDE_DIRECTORIES>"
  "$<TARGET_PROPERTY:hier_frontend,INTERFACE_INCLUDE_DIRECTORIES>")
target_compile_definitions(a_m7_search_display_path PRIVATE
  HIER_DISPLAY_PATH_FIXTURE="${PROJECT_SOURCE_DIR}/tests/fixtures/m3/lookup.sv")
target_link_libraries(a_m7_search_display_path PRIVATE hier_protocol Catch2::Catch2WithMain hier_warnings)
add_test(NAME a_m7_search_display_path COMMAND a_m7_search_display_path)
set_tests_properties(a_m7_search_display_path PROPERTIES TIMEOUT 180)
