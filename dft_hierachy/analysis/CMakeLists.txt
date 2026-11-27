add_library(dft_sequential STATIC sequential/Check.cpp sequential/SourceLogic.cpp sequential/ClockUsage.cpp
  sequential/PrimaryInputs.cpp sequential/ConstantValue.cpp sequential/Scenarios.cpp sequential/SourceIdentity.cpp sequential/SourceInventory.cpp sequential/ControlResolver.cpp sequential/ReportValidation.cpp sequential/ControlGeneration.cpp sequential/GenerationComparison.cpp sequential/RegisterStatistics.cpp sequential/IntervalCoverage.cpp sequential/RegisterEventGroups.cpp sequential/RegisterControlProfile.cpp sequential/RegisterStatisticsValidation.cpp sequential/GroupIntervalAttribution.cpp sequential/RegisterResolvedEvents.cpp sequential/ScenarioValidation.cpp sequential/ResolvedEventIdentity.cpp sequential/RegisterScenarios.cpp sequential/RegisterProfileValidation.cpp sequential/RegisterGeneration.cpp sequential/ChangedRegisterCoverage.cpp sequential/RegisterGenerationScenarios.cpp sequential/GenerationGraphValidation.cpp sequential/RegisterFanout.cpp sequential/RegisterControlSources.cpp sequential/RegisterSourceScenarios.cpp sequential/SourceCoverage.cpp sequential/RegisterSourceDeltas.cpp sequential/RegisterSourceAttribution.cpp sequential/RegisterSourceTransitions.cpp sequential/RegisterSourceImpact.cpp sequential/RegisterSourceHierarchy.cpp sequential/RegisterSourceHierarchyMatrix.cpp sequential/RegisterSourceHierarchyRanges.cpp sequential/RegisterSourceRangeSelection.cpp sequential/SourceRangeEvidence.cpp sequential/SourceEvidenceLocations.cpp sequential/SourceEvidenceExcerpts.cpp sequential/SourceInvestigation.cpp)
target_include_directories(dft_sequential PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/sequential")
target_link_libraries(dft_sequential PUBLIC hiercore PRIVATE hier_warnings)

add_executable(dft-seqcheck sequential/main.cpp)
target_link_libraries(dft-seqcheck PRIVATE dft_sequential hier_protocol hier_warnings)

add_executable(dft_sequential_unit tests/CancelTest.cpp)
target_link_libraries(dft_sequential_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_sequential_unit PRIVATE DFT_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/design.sv")
add_test(NAME a_sequential_cancel COMMAND dft_sequential_unit)
add_test(NAME a_sequential_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/cli.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_cli PROPERTIES TIMEOUT 60)

add_library(dft_analysis_layering OBJECT EXCLUDE_FROM_ALL ../core/tests/layering/includes_slang.cpp)
target_link_libraries(dft_analysis_layering PRIVATE dft_sequential)
add_test(NAME a_sequential_layering
  COMMAND ${CMAKE_COMMAND} --build ${CMAKE_BINARY_DIR} --target dft_analysis_layering)
set_tests_properties(a_sequential_layering PROPERTIES
  PASS_REGULAR_EXPRESSION "slang/ast/Compilation\\.h.*(file not found|No such file)")

add_executable(dft_logic_unit tests/LogicCancel.cpp)
target_link_libraries(dft_logic_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_logic_unit PRIVATE
  DFT_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/design.sv"
  DFT_LOGIC_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/logic.sv")
add_test(NAME a_sequential_logic_cancel COMMAND dft_logic_unit)
add_test(NAME a_sequential_logic_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/logic.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_logic_cli PROPERTIES TIMEOUT 60 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_usage_unit tests/UsageCancel.cpp)
target_link_libraries(dft_usage_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_usage_unit PRIVATE
  DFT_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/design.sv"
  DFT_USAGE_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/usage.sv")
add_test(NAME a_sequential_usage_cancel COMMAND dft_usage_unit)
add_test(NAME a_sequential_usage_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/usage.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_usage_cli PROPERTIES TIMEOUT 60 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_gates_unit tests/GatesCancel.cpp)
target_link_libraries(dft_gates_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_gates_unit PRIVATE
  DFT_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/design.sv"
  DFT_GATES_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/gates.sv")
add_test(NAME a_sequential_gates_cancel COMMAND dft_gates_unit)
add_test(NAME a_sequential_gates_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/gates.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_gates_cli PROPERTIES TIMEOUT 60 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_values_unit tests/ValuesCancel.cpp)
target_link_libraries(dft_values_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_values_unit PRIVATE
  DFT_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/design.sv"
  DFT_GATES_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/gates.sv")
add_test(NAME a_sequential_values_cancel COMMAND dft_values_unit)
add_test(NAME a_sequential_values_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/values.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_values_cli PROPERTIES TIMEOUT 60 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_scenarios_unit tests/ScenariosTest.cpp)
target_link_libraries(dft_scenarios_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_scenarios_unit PRIVATE
  DFT_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/design.sv"
  DFT_GATES_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/gates.sv")
add_test(NAME a_sequential_scenarios_unit COMMAND dft_scenarios_unit)
add_test(NAME a_sequential_scenarios_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/scenarios.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_scenarios_cli PROPERTIES TIMEOUT 60 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_scenario_names tests/ScenarioNames.cpp)
target_link_libraries(dft_scenario_names PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_scenario_names PRIVATE DFT_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/design.sv")
add_test(NAME a_sequential_names_unit COMMAND dft_scenario_names)
add_test(NAME a_sequential_names_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/names.py"
  "$<TARGET_FILE:dft-seqcheck>")
set_tests_properties(a_sequential_names_cli PROPERTIES TIMEOUT 60 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_inventory_unit tests/InventoryTest.cpp)
target_link_libraries(dft_inventory_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_inventory_unit PRIVATE DFT_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/design.sv"
  DFT_INVENTORY_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/inventory.sv")
add_test(NAME a_sequential_inventory_unit COMMAND dft_inventory_unit)
add_test(NAME a_sequential_inventory_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/inventory.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_inventory_cli PROPERTIES TIMEOUT 60 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_generation_unit tests/GenerationTest.cpp)
target_link_libraries(dft_generation_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_generation_unit PRIVATE DFT_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/design.sv"
  DFT_GENERATION_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/generation.sv")
add_test(NAME a_sequential_generation_unit COMMAND dft_generation_unit)
add_test(NAME a_sequential_generation_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/generation.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_generation_cli PROPERTIES TIMEOUT 60 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_generation_comparison_unit tests/GenerationComparisonTest.cpp)
target_link_libraries(dft_generation_comparison_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_generation_comparison_unit PRIVATE DFT_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/design.sv"
  DFT_GENERATION_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/generation.sv")
add_test(NAME a_sequential_generation_comparison_unit COMMAND dft_generation_comparison_unit)
add_test(NAME a_sequential_generation_comparison_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/generation-comparison.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_generation_comparison_cli PROPERTIES TIMEOUT 60 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

# B48 1fb162d -> 33fb393: oracle inputs are byte-identical to the independent freeze.
add_executable(b48_generation_contract tests/independent-generation/unit.cpp)
target_link_libraries(b48_generation_contract PRIVATE dft_sequential hier_warnings)
add_test(NAME b48_generation_contract COMMAND b48_generation_contract "${CMAKE_CURRENT_SOURCE_DIR}/tests/independent-generation/design.sv")
add_test(NAME b48_generation_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/run-independent-generation.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/.." "${CMAKE_CURRENT_BINARY_DIR}/b48-result.json")
set_tests_properties(b48_generation_cli PROPERTIES TIMEOUT 90 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_statistics_unit tests/StatisticsTest.cpp)
target_link_libraries(dft_statistics_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_statistics_unit PRIVATE DFT_STATISTICS_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/statistics.sv")
add_test(NAME a_sequential_statistics_unit COMMAND dft_statistics_unit)
add_test(NAME a_sequential_statistics_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/statistics.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_statistics_cli PROPERTIES TIMEOUT 60 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_event_groups_unit tests/EventGroupsTest.cpp)
target_link_libraries(dft_event_groups_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_event_groups_unit PRIVATE DFT_EVENT_GROUP_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/event-groups.sv")
add_test(NAME a_sequential_event_groups_unit COMMAND dft_event_groups_unit)
add_test(NAME a_sequential_event_groups_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/event-groups.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_event_groups_cli PROPERTIES TIMEOUT 60 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_register_profile_unit tests/RegisterProfileTest.cpp)
target_link_libraries(dft_register_profile_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_register_profile_unit PRIVATE DFT_PROFILE_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/register-profile.sv")
add_test(NAME a_sequential_register_profile_unit COMMAND dft_register_profile_unit)
add_test(NAME a_sequential_register_profile_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/register-profile.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_register_profile_cli PROPERTIES TIMEOUT 60 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_resolved_events_unit tests/ResolvedEventsTest.cpp)
target_link_libraries(dft_resolved_events_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_resolved_events_unit PRIVATE DFT_RESOLVED_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/resolved-events.sv")
add_test(NAME a_sequential_resolved_events_unit COMMAND dft_resolved_events_unit)
add_test(NAME a_sequential_resolved_events_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/resolved-events.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_resolved_events_cli PROPERTIES TIMEOUT 60 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

# B49 198639ca -> 1ee74b92 -> 9a764448: byte-identical final independent oracle.
add_executable(b49_registers_contract tests/independent-registers/unit.cpp)
target_link_libraries(b49_registers_contract PRIVATE dft_sequential hier_warnings)
add_test(NAME b49_registers_contract COMMAND b49_registers_contract "${CMAKE_CURRENT_SOURCE_DIR}/tests/independent-registers/design.sv")
add_test(NAME b49_registers_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/run-independent-registers.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/.." "${CMAKE_CURRENT_BINARY_DIR}/b49-result.json")
set_tests_properties(b49_registers_cli PROPERTIES TIMEOUT 90 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_register_scenarios_unit tests/RegisterScenariosTest.cpp)
target_link_libraries(dft_register_scenarios_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_register_scenarios_unit PRIVATE DFT_REGISTER_SCENARIOS_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/register-scenarios.sv")
add_test(NAME a_sequential_register_scenarios_unit COMMAND dft_register_scenarios_unit)
add_test(NAME a_sequential_register_scenarios_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/register-scenarios.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_register_scenarios_cli PROPERTIES TIMEOUT 90 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_register_generation_unit tests/RegisterGenerationTest.cpp)
target_link_libraries(dft_register_generation_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_register_generation_unit PRIVATE DFT_REGISTER_GENERATION_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/register-generation.sv")
add_test(NAME a_sequential_register_generation_unit COMMAND dft_register_generation_unit)
add_test(NAME a_sequential_register_generation_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/register-generation.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_register_generation_cli PROPERTIES TIMEOUT 90 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_register_generation_scenarios_unit tests/RegisterGenerationScenariosTest.cpp)
target_link_libraries(dft_register_generation_scenarios_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_register_generation_scenarios_unit PRIVATE DFT_DEEP_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/register-generation-scenarios.sv")
add_test(NAME a_sequential_register_generation_scenarios_unit COMMAND dft_register_generation_scenarios_unit)
add_test(NAME a_sequential_register_generation_scenarios_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/register-generation-scenarios.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_register_generation_scenarios_cli PROPERTIES TIMEOUT 90 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

# B50 02633ad2: byte-identical independent public API/RTL/CLI oracle.
add_executable(b50_register_evolution_contract tests/independent-register-evolution/unit.cpp)
target_link_libraries(b50_register_evolution_contract PRIVATE dft_sequential hier_warnings)
add_test(NAME b50_register_evolution_contract COMMAND b50_register_evolution_contract "${CMAKE_CURRENT_SOURCE_DIR}/tests/independent-register-evolution/design.sv")
add_test(NAME b50_register_evolution_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/run-independent-register-evolution.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/.." "${CMAKE_CURRENT_BINARY_DIR}/b50-result.json")
set_tests_properties(b50_register_evolution_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_register_fanout_unit tests/RegisterFanoutTest.cpp)
target_link_libraries(dft_register_fanout_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_register_fanout_unit PRIVATE DFT_FANOUT_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/register-fanout.sv")
add_test(NAME a_sequential_register_fanout_unit COMMAND dft_register_fanout_unit)
add_test(NAME a_sequential_register_fanout_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/register-fanout.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_register_fanout_cli PROPERTIES TIMEOUT 90 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_register_sources_unit tests/RegisterControlSourcesTest.cpp)
target_link_libraries(dft_register_sources_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_register_sources_unit PRIVATE DFT_SOURCES_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/register-control-sources.sv")
add_test(NAME a_sequential_register_sources_unit COMMAND dft_register_sources_unit)
add_test(NAME a_sequential_register_sources_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/register-control-sources.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_register_sources_cli PROPERTIES TIMEOUT 90 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_source_scenarios_unit tests/RegisterSourceScenariosTest.cpp)
target_link_libraries(dft_source_scenarios_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_source_scenarios_unit PRIVATE DFT_SOURCE_SCENARIOS_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-scenarios.sv")
add_test(NAME a_sequential_source_scenarios_unit COMMAND dft_source_scenarios_unit)
add_test(NAME a_sequential_source_scenarios_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/source-scenarios.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_source_scenarios_cli PROPERTIES TIMEOUT 90 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

# B51 43160589 -> e09514e4: byte-identical final independent oracle.
add_executable(b51_register_sources_contract tests/independent-register-sources/unit.cpp)
target_link_libraries(b51_register_sources_contract PRIVATE dft_sequential hier_warnings)
add_test(NAME b51_register_sources_contract COMMAND b51_register_sources_contract "${CMAKE_CURRENT_SOURCE_DIR}/tests/independent-register-sources/design.sv")
add_test(NAME b51_register_sources_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/run-independent-register-sources.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/.." "${CMAKE_CURRENT_BINARY_DIR}/b51-result.json")
set_tests_properties(b51_register_sources_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_source_deltas_unit tests/RegisterSourceDeltasTest.cpp)
target_link_libraries(dft_source_deltas_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_source_deltas_unit PRIVATE DFT_DELTA_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-scenarios.sv")
add_test(NAME a_sequential_source_deltas_unit COMMAND dft_source_deltas_unit)
add_test(NAME a_sequential_source_deltas_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/source-deltas.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_source_deltas_cli PROPERTIES TIMEOUT 90 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_source_attribution_unit tests/RegisterSourceAttributionTest.cpp)
target_link_libraries(dft_source_attribution_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_source_attribution_unit PRIVATE DFT_ATTRIBUTION_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-scenarios.sv")
add_test(NAME a_sequential_source_attribution_unit COMMAND dft_source_attribution_unit)
add_test(NAME a_sequential_source_attribution_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/source-attribution.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_source_attribution_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_source_transitions_unit tests/RegisterSourceTransitionsTest.cpp)
target_link_libraries(dft_source_transitions_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_source_transitions_unit PRIVATE DFT_TRANSITION_BASE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-scenarios.sv"
  DFT_TRANSITION_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-transitions.sv")
add_test(NAME a_sequential_source_transitions_unit COMMAND dft_source_transitions_unit)
add_test(NAME a_sequential_source_transitions_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/source-transitions.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_source_transitions_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

# B52 4c95814c -> ae092972: byte-identical final independent source-change oracle.
add_executable(b52_source_changes_contract tests/independent-source-changes/unit.cpp)
target_link_libraries(b52_source_changes_contract PRIVATE dft_sequential hier_warnings)
add_test(NAME b52_source_changes_contract COMMAND b52_source_changes_contract "${CMAKE_CURRENT_SOURCE_DIR}/tests/independent-source-changes/design.sv")
add_test(NAME b52_source_changes_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/run-independent-source-changes.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/.." "${CMAKE_CURRENT_BINARY_DIR}/b52-result.json")
set_tests_properties(b52_source_changes_cli PROPERTIES TIMEOUT 180 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_source_impact_unit tests/RegisterSourceImpactTest.cpp)
target_link_libraries(dft_source_impact_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_source_impact_unit PRIVATE DFT_IMPACT_BASE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-scenarios.sv"
  DFT_IMPACT_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-impact.sv")
add_test(NAME a_sequential_source_impact_unit COMMAND dft_source_impact_unit)
add_test(NAME a_sequential_source_impact_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/source-impact.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_source_impact_cli PROPERTIES TIMEOUT 180 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_source_hierarchy_unit tests/RegisterSourceHierarchyTest.cpp)
target_link_libraries(dft_source_hierarchy_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_source_hierarchy_unit PRIVATE DFT_HIERARCHY_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-hierarchy.sv"
  DFT_HIERARCHY_BASE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-scenarios.sv")
add_test(NAME a_sequential_source_hierarchy_unit COMMAND dft_source_hierarchy_unit)
add_test(NAME a_sequential_source_hierarchy_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/source-hierarchy.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_source_hierarchy_cli PROPERTIES TIMEOUT 180 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_source_hierarchy_matrix_unit tests/RegisterSourceHierarchyMatrixTest.cpp)
target_link_libraries(dft_source_hierarchy_matrix_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_source_hierarchy_matrix_unit PRIVATE DFT_HIERARCHY_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-hierarchy.sv"
  DFT_HIERARCHY_BASE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-scenarios.sv" DFT_MATRIX_MULTI="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-transitions.sv")
add_test(NAME a_sequential_source_hierarchy_matrix_unit COMMAND dft_source_hierarchy_matrix_unit)
add_test(NAME a_sequential_source_hierarchy_matrix_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/source-hierarchy-matrix.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_source_hierarchy_matrix_cli PROPERTIES TIMEOUT 240 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

# B53 6ae9fa9a and empty-prefix c46ce5c8 -> afc26033 -> 274eee27: unchanged oracle inputs.
add_executable(b53_source_hierarchy_contract tests/independent-source-hierarchy/unit.cpp)
target_link_libraries(b53_source_hierarchy_contract PRIVATE dft_sequential hier_warnings)
add_test(NAME b53_source_hierarchy_contract COMMAND b53_source_hierarchy_contract "${CMAKE_CURRENT_SOURCE_DIR}/tests/independent-source-hierarchy/design.sv")
add_test(NAME b53_source_hierarchy_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/run-independent-source-hierarchy.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/.." "${CMAKE_CURRENT_BINARY_DIR}/b53-result.json")
set_tests_properties(b53_source_hierarchy_cli PROPERTIES TIMEOUT 240 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")
add_executable(b53_source_hierarchy_empty_prefix tests/independent-source-hierarchy/empty-prefix.cpp)
target_link_libraries(b53_source_hierarchy_empty_prefix PRIVATE dft_sequential hier_warnings)
add_test(NAME b53_source_hierarchy_empty_prefix COMMAND b53_source_hierarchy_empty_prefix "${CMAKE_CURRENT_SOURCE_DIR}/tests/independent-source-hierarchy/design.sv")
add_test(NAME b53_source_hierarchy_empty_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/run-independent-source-hierarchy.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/.." "${CMAKE_CURRENT_BINARY_DIR}/b53-empty-result.json" --empty)
set_tests_properties(b53_source_hierarchy_empty_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_source_hierarchy_ranges_unit tests/RegisterSourceHierarchyRangesTest.cpp)
target_link_libraries(dft_source_hierarchy_ranges_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_source_hierarchy_ranges_unit PRIVATE DFT_RANGE_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-hierarchy-ranges.sv"
  DFT_HIERARCHY_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-hierarchy.sv")
add_test(NAME a_sequential_source_hierarchy_ranges_unit COMMAND dft_source_hierarchy_ranges_unit)
add_test(NAME a_sequential_source_hierarchy_ranges_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/source-hierarchy-ranges.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_source_hierarchy_ranges_cli PROPERTIES TIMEOUT 240 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_source_range_selection_unit tests/RegisterSourceRangeSelectionTest.cpp)
target_link_libraries(dft_source_range_selection_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_source_range_selection_unit PRIVATE DFT_RANGE_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-hierarchy-ranges.sv"
  DFT_HIERARCHY_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-hierarchy.sv")
add_test(NAME a_sequential_source_range_selection_unit COMMAND dft_source_range_selection_unit)
add_test(NAME a_sequential_source_range_selection_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/source-range-selection.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_source_range_selection_cli PROPERTIES TIMEOUT 240 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

# B54 549c5221 -> ec0cbaec: unchanged oracle and fixture, coordinate revision retained by B.
add_executable(b54_source_ranges_contract tests/independent-source-ranges/unit.cpp)
target_link_libraries(b54_source_ranges_contract PRIVATE dft_sequential hier_warnings)
add_test(NAME b54_source_ranges_contract COMMAND b54_source_ranges_contract "${CMAKE_CURRENT_SOURCE_DIR}/tests/independent-source-ranges/design.sv")
set_tests_properties(b54_source_ranges_contract PROPERTIES TIMEOUT 60)
add_test(NAME b54_source_ranges_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/run-independent-source-ranges.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/.." "${CMAKE_CURRENT_BINARY_DIR}/b54-result.json")
set_tests_properties(b54_source_ranges_cli PROPERTIES TIMEOUT 240 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_source_range_evidence_unit tests/SourceRangeEvidenceTest.cpp)
target_link_libraries(dft_source_range_evidence_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_source_range_evidence_unit PRIVATE DFT_RANGE_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-hierarchy-ranges.sv"
  DFT_HIERARCHY_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-hierarchy.sv" DFT_EVIDENCE_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-range-evidence.sv")
add_test(NAME a_sequential_source_range_evidence_unit COMMAND dft_source_range_evidence_unit)
add_test(NAME a_sequential_source_range_evidence_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/source-range-evidence.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_source_range_evidence_cli PROPERTIES TIMEOUT 240 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_source_evidence_locations_unit tests/SourceEvidenceLocationsTest.cpp)
target_link_libraries(dft_source_evidence_locations_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_source_evidence_locations_unit PRIVATE DFT_LOCATIONS_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-evidence-locations.sv")
add_test(NAME a_sequential_source_evidence_locations_unit COMMAND dft_source_evidence_locations_unit)
add_test(NAME a_sequential_source_evidence_locations_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/source-evidence-locations.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_source_evidence_locations_cli PROPERTIES TIMEOUT 240 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_source_evidence_excerpts_unit tests/SourceEvidenceExcerptsTest.cpp)
target_link_libraries(dft_source_evidence_excerpts_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_source_evidence_excerpts_unit PRIVATE DFT_EXCERPT_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-evidence-excerpts.sv"
  DFT_EXCERPT_LEAF="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-evidence-excerpts-leaf.svh")
add_test(NAME a_sequential_source_evidence_excerpts_unit COMMAND dft_source_evidence_excerpts_unit)
add_test(NAME a_sequential_source_evidence_excerpts_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/source-evidence-excerpts.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_source_evidence_excerpts_cli PROPERTIES TIMEOUT 240 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_test(NAME a_sequential_source_excerpt_newlines COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/source-excerpt-newlines.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_source_excerpt_newlines PROPERTIES TIMEOUT 240 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

# B55 e2783397 -> 0764b8bf / 4279afb9: final frozen oracle, byte-identical to 78a7877a.
add_executable(b55_source_evidence_contract tests/independent-source-evidence/unit.cpp)
target_link_libraries(b55_source_evidence_contract PRIVATE dft_sequential hier_warnings)
add_test(NAME b55_source_evidence_contract COMMAND b55_source_evidence_contract "${CMAKE_CURRENT_SOURCE_DIR}/tests/independent-source-evidence/design.sv")
set_tests_properties(b55_source_evidence_contract PROPERTIES TIMEOUT 60)
add_test(NAME b55_source_evidence_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/run-independent-source-evidence.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/.." "${CMAKE_CURRENT_BINARY_DIR}/b55-result.json")
add_test(NAME b55_source_evidence_newlines COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/run-independent-source-evidence.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/.." "${CMAKE_CURRENT_BINARY_DIR}/b55-newlines-result.json" --newlines)
set_tests_properties(b55_source_evidence_cli b55_source_evidence_newlines PROPERTIES TIMEOUT 240 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_source_investigation_unit tests/SourceInvestigationTest.cpp)
target_link_libraries(dft_source_investigation_unit PRIVATE dft_sequential hier_warnings)
target_compile_definitions(dft_source_investigation_unit PRIVATE DFT_EXCERPT_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/source-evidence-excerpts.sv")
add_test(NAME a_sequential_source_investigation_unit COMMAND dft_source_investigation_unit)
add_test(NAME a_sequential_source_investigation_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/source-investigation.py"
  "$<TARGET_FILE:dft-seqcheck>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_sequential_source_investigation_cli PROPERTIES TIMEOUT 240 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

# Independent upper-level RTL object consumer; no Slang or sequential rule dependency.
add_library(dft_objects STATIC objects/ObjectCatalog.cpp)
target_include_directories(dft_objects PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/objects")
target_link_libraries(dft_objects PUBLIC hiercore PRIVATE hier_warnings)
add_executable(dft-objects objects/main.cpp)
add_library(dft_objects_json STATIC objects/ObjectCatalogJson.cpp)
target_link_libraries(dft_objects_json PUBLIC dft_objects hier_protocol PRIVATE hier_warnings)
target_link_libraries(dft-objects PRIVATE dft_objects_json hier_warnings)
add_executable(dft_object_catalog_unit tests/ObjectCatalogTest.cpp)
target_link_libraries(dft_object_catalog_unit PRIVATE dft_objects hier_warnings)
target_compile_definitions(dft_object_catalog_unit PRIVATE DFT_CATALOG_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/object-catalog.sv")
add_test(NAME a_object_catalog_unit COMMAND dft_object_catalog_unit)
add_test(NAME a_object_catalog_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/object-catalog.py"
  "$<TARGET_FILE:dft-objects>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_object_catalog_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")
add_library(dft_objects_layering OBJECT EXCLUDE_FROM_ALL ../core/tests/layering/includes_slang.cpp)
target_link_libraries(dft_objects_layering PRIVATE dft_objects)
add_test(NAME a_object_catalog_layering COMMAND ${CMAKE_COMMAND} --build ${CMAKE_BINARY_DIR} --target dft_objects_layering)
set_tests_properties(a_object_catalog_layering PROPERTIES PASS_REGULAR_EXPRESSION "slang/ast/Compilation\\.h.*(file not found|No such file)")

add_library(dft_memory STATIC memory/MacroInterfaces.cpp memory/MemoryMap.cpp memory/PinLibrary.cpp memory/MemoryInvestigation.cpp memory/MemoryTestPlan.cpp memory/MemoryTestRules.cpp memory/MemoryTestSchedule.cpp memory/MemoryScheduleResources.cpp memory/MemoryScheduleDependencies.cpp memory/MemoryTestTiming.cpp memory/MemoryTestComparison.cpp memory/MemoryTestCoverage.cpp memory/MemoryResourceUsageComparison.cpp memory/MemoryResourceUsage.cpp memory/MemoryClockSources.cpp memory/MemoryTestDomains.cpp memory/MemoryClockCheck.cpp memory/MemoryTestAssessment.cpp memory/MemoryTestAssessmentComparison.cpp)
target_include_directories(dft_memory PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/memory")
target_link_libraries(dft_memory PUBLIC dft_objects dft_sequential PRIVATE hier_warnings)
add_executable(dft-memory memory/main.cpp)
add_library(dft_memory_json STATIC memory/MacroInterfacesJson.cpp memory/MemoryMapJson.cpp memory/PinLibraryJson.cpp memory/MemoryTestPlanJson.cpp memory/MemoryTestRulesJson.cpp memory/MemoryTestScheduleJson.cpp memory/MemoryTestTimingJson.cpp memory/MemoryTestComparisonJson.cpp memory/MemoryTestCoverageJson.cpp memory/MemoryResourceUsageComparisonJson.cpp memory/MemoryResourceUsageJson.cpp memory/MemoryClockSourcesJson.cpp memory/MemoryTestDomainsJson.cpp memory/MemoryClockCheckJson.cpp memory/MemoryTestAssessmentJson.cpp memory/MemoryTestAssessmentComparisonJson.cpp)
target_link_libraries(dft_memory_json PUBLIC dft_memory dft_objects_json PRIVATE hier_warnings)
add_library(dft_analysis_input STATIC input/JsonInputInternal.cpp)
target_link_libraries(dft_analysis_input PUBLIC hier_protocol PRIVATE hier_warnings)
add_library(dft_memory_input STATIC memory/MemoryLibraryInput.cpp memory/MemoryTestRulesInput.cpp memory/MemoryTestConfigInput.cpp memory/MemoryClockCheckInput.cpp memory/MemoryScheduleResourcesInput.cpp memory/MemoryScheduleDependenciesInput.cpp)
target_link_libraries(dft_memory_input PUBLIC dft_memory hier_protocol PRIVATE dft_analysis_input hier_warnings)
target_link_libraries(dft-memory PRIVATE dft_memory_json dft_memory_input hier_warnings)
add_executable(dft_macro_interfaces_unit tests/MacroInterfacesTest.cpp)
target_link_libraries(dft_macro_interfaces_unit PRIVATE dft_memory hier_warnings)
target_compile_definitions(dft_macro_interfaces_unit PRIVATE DFT_MACRO_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/macro-interfaces.sv")
add_test(NAME a_macro_interfaces_unit COMMAND dft_macro_interfaces_unit)
add_test(NAME a_macro_interfaces_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/macro-interfaces.py"
  "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_macro_interfaces_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")
add_library(dft_memory_layering OBJECT EXCLUDE_FROM_ALL ../core/tests/layering/includes_slang.cpp)
target_link_libraries(dft_memory_layering PRIVATE dft_memory)
add_test(NAME a_macro_interfaces_layering COMMAND ${CMAKE_COMMAND} --build ${CMAKE_BINARY_DIR} --target dft_memory_layering)
set_tests_properties(a_macro_interfaces_layering PROPERTIES PASS_REGULAR_EXPRESSION "slang/ast/Compilation\\.h.*(file not found|No such file)")

# B56 c292dc87 / oracle correction 47e1a804: imported files unchanged.
add_executable(b56_investigation_catalog_contract tests/independent-investigation-catalog/unit.cpp)
target_link_libraries(b56_investigation_catalog_contract PRIVATE dft_sequential dft_objects hier_warnings)
add_test(NAME b56_investigation_catalog_contract COMMAND b56_investigation_catalog_contract
  "${CMAKE_CURRENT_SOURCE_DIR}/tests/independent-investigation-catalog/design.sv"
  "${CMAKE_CURRENT_SOURCE_DIR}/tests/independent-investigation-catalog/catalog.sv")
add_test(NAME b56_investigation_catalog_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/independent-investigation-catalog/run.py"
  --binary "$<TARGET_FILE:dft-seqcheck>" --objects "$<TARGET_FILE:dft-objects>" --product "${CMAKE_CURRENT_SOURCE_DIR}/.." --out "${CMAKE_CURRENT_BINARY_DIR}/b56-result")
set_tests_properties(b56_investigation_catalog_cli PROPERTIES TIMEOUT 240 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_map_unit tests/MemoryMapTest.cpp)
target_link_libraries(dft_memory_map_unit PRIVATE dft_memory hier_warnings)
target_compile_definitions(dft_memory_map_unit PRIVATE DFT_MEMORY_MAP_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-map.sv")
add_test(NAME a_memory_map_unit COMMAND dft_memory_map_unit)
add_test(NAME a_memory_map_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-map.py"
  "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_map_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_library_unit tests/MemoryLibraryTest.cpp)
target_link_libraries(dft_memory_library_unit PRIVATE dft_memory hier_warnings)
target_compile_definitions(dft_memory_library_unit PRIVATE DFT_MEMORY_LIBRARY_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-library.sv")
add_test(NAME a_memory_library_unit COMMAND dft_memory_library_unit)
add_test(NAME a_memory_library_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-library.py"
  "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_library_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_investigation_unit tests/MemoryInvestigationTest.cpp)
target_link_libraries(dft_memory_investigation_unit PRIVATE dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_investigation_unit PRIVATE DFT_MEMORY_INVESTIGATION_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-library.sv")
add_test(NAME a_memory_investigation_unit COMMAND dft_memory_investigation_unit)
add_test(NAME a_memory_investigation_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-investigation.py"
  "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_investigation_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

# B57 frozen native oracle, copied byte-for-byte from test/m5-tree 511ecb32.
# B-owned C12 CLI maintenance is copied from 4e2443c1 (DESIGN7.10); old failure evidence remains.
add_executable(b57_memory_contract tests/independent-memory/unit.cpp)
target_link_libraries(b57_memory_contract PRIVATE dft_memory hier_protocol hier_warnings)
add_test(NAME b57_memory_contract COMMAND b57_memory_contract "${CMAKE_CURRENT_SOURCE_DIR}/tests/independent-memory/design.sv")
set_tests_properties(b57_memory_contract PROPERTIES TIMEOUT 120)

add_executable(dft_memory_test_plan_unit tests/MemoryTestPlanTest.cpp)
target_link_libraries(dft_memory_test_plan_unit PRIVATE dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_test_plan_unit PRIVATE DFT_MEMORY_TEST_PLAN_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-test-plan.sv")
add_test(NAME a_memory_test_plan_unit COMMAND dft_memory_test_plan_unit)
add_test(NAME a_memory_test_plan_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-test-plan.py"
  "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_test_plan_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_library_input_unit tests/MemoryLibraryInputTest.cpp)
target_link_libraries(dft_memory_library_input_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_library_input_unit PRIVATE
  DFT_MEMORY_LIBRARY_INPUT_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-library-input.json"
  DFT_MEMORY_TEST_PLAN_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-test-plan.sv")
add_test(NAME a_memory_library_input_unit COMMAND dft_memory_library_input_unit)
add_test(NAME a_memory_library_input_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-library-input.py"
  "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_library_input_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_test_rules_unit tests/MemoryTestRulesTest.cpp)
target_link_libraries(dft_memory_test_rules_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_test_rules_unit PRIVATE DFT_MEMORY_RULE_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-test-rules.sv")
add_test(NAME a_memory_test_rules_unit COMMAND dft_memory_test_rules_unit)
add_test(NAME a_memory_test_rules_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-test-rules.py"
  "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_test_rules_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_test_schedule_unit tests/MemoryTestScheduleTest.cpp)
target_link_libraries(dft_memory_test_schedule_unit PRIVATE dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_test_schedule_unit PRIVATE DFT_MEMORY_SCHEDULE_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-test-schedule.sv")
add_test(NAME a_memory_test_schedule_unit COMMAND dft_memory_test_schedule_unit)
add_test(NAME a_memory_test_schedule_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-test-schedule.py"
  "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_test_schedule_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_test_timing_unit tests/MemoryTestTimingTest.cpp)
target_link_libraries(dft_memory_test_timing_unit PRIVATE dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_test_timing_unit PRIVATE DFT_MEMORY_SCHEDULE_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-test-schedule.sv" DFT_MEMORY_TIMING_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-test-timing.sv")
add_test(NAME a_memory_test_timing_unit COMMAND dft_memory_test_timing_unit)
add_test(NAME a_memory_test_timing_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-test-timing.py"
  "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_test_timing_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_test_config_unit tests/MemoryTestConfigTest.cpp)
target_link_libraries(dft_memory_test_config_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_test_config_unit PRIVATE
  DFT_MEMORY_CONFIG_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_test_config_unit COMMAND dft_memory_test_config_unit)
add_test(NAME a_memory_test_config_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-test-config.py"
  "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_test_config_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_test_comparison_unit tests/MemoryTestComparisonTest.cpp)
target_link_libraries(dft_memory_test_comparison_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_test_comparison_unit PRIVATE DFT_MEMORY_COMPARISON_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_test_comparison_unit COMMAND dft_memory_test_comparison_unit)
add_test(NAME a_memory_test_comparison_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-test-comparison.py"
  "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_test_comparison_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_test_coverage_unit tests/MemoryTestCoverageTest.cpp)
target_link_libraries(dft_memory_test_coverage_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_test_coverage_unit PRIVATE DFT_MEMORY_COVERAGE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_test_coverage_unit COMMAND dft_memory_test_coverage_unit)
add_test(NAME a_memory_test_coverage_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-test-coverage.py"
  "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_test_coverage_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_clock_sources_unit tests/MemoryClockSourcesTest.cpp)
target_link_libraries(dft_memory_clock_sources_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_clock_sources_unit PRIVATE DFT_MEMORY_CLOCK_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_clock_sources_unit COMMAND dft_memory_clock_sources_unit)
add_test(NAME a_memory_clock_sources_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-clock-sources.py"
  "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_clock_sources_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_test_domains_unit tests/MemoryTestDomainsTest.cpp)
target_link_libraries(dft_memory_test_domains_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_test_domains_unit PRIVATE DFT_MEMORY_DOMAIN_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_test_domains_unit COMMAND dft_memory_test_domains_unit)
add_test(NAME a_memory_test_domains_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-test-domains.py"
  "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_test_domains_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_clock_check_unit tests/MemoryClockCheckTest.cpp)
target_link_libraries(dft_memory_clock_check_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_clock_check_unit PRIVATE DFT_MEMORY_CHECK_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_clock_check_unit COMMAND dft_memory_clock_check_unit)
add_test(NAME a_memory_clock_check_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-clock-check.py"
  "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_clock_check_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_test_assessment_unit tests/MemoryTestAssessmentTest.cpp)
target_link_libraries(dft_memory_test_assessment_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_test_assessment_unit PRIVATE DFT_MEMORY_ASSESSMENT_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_test_assessment_unit COMMAND dft_memory_test_assessment_unit)
add_test(NAME a_memory_test_assessment_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-test-assessment.py" "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_test_assessment_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_assessment_comparison_unit tests/MemoryTestAssessmentComparisonTest.cpp)
target_link_libraries(dft_memory_assessment_comparison_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_assessment_comparison_unit PRIVATE DFT_MEMORY_ASSESSMENT_COMPARISON_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_assessment_comparison_unit COMMAND dft_memory_assessment_comparison_unit)
add_test(NAME a_memory_assessment_comparison_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-assessment-comparison.py" "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_assessment_comparison_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_schedule_resources_unit tests/MemoryScheduleResourcesTest.cpp)
target_link_libraries(dft_memory_schedule_resources_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_schedule_resources_unit PRIVATE DFT_MEMORY_RESOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_schedule_resources_unit COMMAND dft_memory_schedule_resources_unit)
add_test(NAME a_memory_schedule_resources_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-schedule-resources.py" "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_schedule_resources_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_schedule_dependencies_unit tests/MemoryScheduleDependenciesTest.cpp)
target_link_libraries(dft_memory_schedule_dependencies_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_schedule_dependencies_unit PRIVATE DFT_MEMORY_DEPENDENCY_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_schedule_dependencies_unit COMMAND dft_memory_schedule_dependencies_unit)
add_test(NAME a_memory_schedule_dependencies_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-schedule-dependencies.py" "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_schedule_dependencies_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_resource_recovery_unit tests/MemoryResourceRecoveryTest.cpp)
target_link_libraries(dft_memory_resource_recovery_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_resource_recovery_unit PRIVATE DFT_MEMORY_RECOVERY_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_resource_recovery_unit COMMAND dft_memory_resource_recovery_unit)
add_test(NAME a_memory_resource_recovery_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-resource-recovery.py" "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_resource_recovery_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_resource_power_unit tests/MemoryResourcePowerTest.cpp)
target_link_libraries(dft_memory_resource_power_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_resource_power_unit PRIVATE DFT_MEMORY_POWER_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_resource_power_unit COMMAND dft_memory_resource_power_unit)
add_test(NAME a_memory_resource_power_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-resource-power.py" "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_resource_power_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_dependency_gap_unit tests/MemoryDependencyGapTest.cpp)
target_link_libraries(dft_memory_dependency_gap_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_dependency_gap_unit PRIVATE DFT_MEMORY_GAP_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_dependency_gap_unit COMMAND dft_memory_dependency_gap_unit)
add_test(NAME a_memory_dependency_gap_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-dependency-gap.py" "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_dependency_gap_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_resource_usage_unit tests/MemoryResourceUsageTest.cpp)
target_link_libraries(dft_memory_resource_usage_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_resource_usage_unit PRIVATE DFT_MEMORY_USAGE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_resource_usage_unit COMMAND dft_memory_resource_usage_unit)
add_test(NAME a_memory_resource_usage_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-resource-usage.py" "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_resource_usage_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_resource_comparison_unit tests/MemoryResourceUsageComparisonTest.cpp)
target_link_libraries(dft_memory_resource_comparison_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_resource_comparison_unit PRIVATE DFT_MEMORY_RESOURCE_COMPARISON_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_resource_comparison_unit COMMAND dft_memory_resource_comparison_unit)
add_test(NAME a_memory_resource_comparison_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-resource-comparison.py" "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_resource_comparison_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_resource_units_unit tests/MemoryResourceUnitsTest.cpp)
target_link_libraries(dft_memory_resource_units_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_resource_units_unit PRIVATE DFT_MEMORY_UNITS_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_resource_units_unit COMMAND dft_memory_resource_units_unit)
add_test(NAME a_memory_resource_units_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-resource-units.py" "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_resource_units_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_resource_availability_unit tests/MemoryResourceAvailabilityTest.cpp)
target_link_libraries(dft_memory_resource_availability_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_resource_availability_unit PRIVATE DFT_MEMORY_AVAILABILITY_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_resource_availability_unit COMMAND dft_memory_resource_availability_unit)
add_test(NAME a_memory_resource_availability_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-resource-availability.py" "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_resource_availability_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_resource_partitions_unit tests/MemoryResourcePartitionsTest.cpp)
target_link_libraries(dft_memory_resource_partitions_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_resource_partitions_unit PRIVATE DFT_MEMORY_PARTITIONS_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_resource_partitions_unit COMMAND dft_memory_resource_partitions_unit)
add_test(NAME a_memory_resource_partitions_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-resource-partitions.py" "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_resource_partitions_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_test(NAME a_memory_calendar_wire_range_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-calendar-wire-range.py" "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_calendar_wire_range_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_dependency_partitions_unit tests/MemoryDependencyPartitionsTest.cpp)
target_link_libraries(dft_memory_dependency_partitions_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_dependency_partitions_unit PRIVATE DFT_MEMORY_DEPENDENCY_PARTITIONS_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_dependency_partitions_unit COMMAND dft_memory_dependency_partitions_unit)
add_test(NAME a_memory_dependency_partitions_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-dependency-partitions.py" "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_dependency_partitions_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_memory_clock_partitions_unit tests/MemoryClockPartitionsTest.cpp)
target_link_libraries(dft_memory_clock_partitions_unit PRIVATE dft_memory_input dft_memory_json hier_warnings)
target_compile_definitions(dft_memory_clock_partitions_unit PRIVATE DFT_MEMORY_CLOCK_PARTITIONS_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_memory_clock_partitions_unit COMMAND dft_memory_clock_partitions_unit)
add_test(NAME a_memory_clock_partitions_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/memory-clock-partitions.py" "$<TARGET_FILE:dft-memory>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_memory_clock_partitions_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_library(dft_wrapper STATIC wrapper/Boundary.cpp wrapper/CellPlan.cpp wrapper/ChainPlan.cpp wrapper/ChainComparison.cpp wrapper/ChainCoverage.cpp wrapper/ChainClocks.cpp wrapper/ChainResets.cpp wrapper/ChainCompatibility.cpp wrapper/ChainActivityPlan.cpp wrapper/ChainActivitySchedule.cpp wrapper/ChainExplanation.cpp)
target_include_directories(dft_wrapper PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/wrapper")
target_link_libraries(dft_wrapper PUBLIC hiercore dft_sequential PRIVATE hier_warnings)
add_library(dft_wrapper_json STATIC wrapper/BoundaryJson.cpp wrapper/CellPlanJson.cpp wrapper/ChainPlanJson.cpp wrapper/ChainComparisonJson.cpp wrapper/ChainCoverageJson.cpp wrapper/ChainClocksJson.cpp wrapper/ChainResetsJson.cpp wrapper/ChainCompatibilityJson.cpp wrapper/ChainActivityPlanJson.cpp wrapper/ChainActivityScheduleJson.cpp wrapper/ChainExplanationJson.cpp)
target_link_libraries(dft_wrapper_json PUBLIC dft_wrapper hier_protocol PRIVATE hier_warnings)
add_library(dft_wrapper_input STATIC wrapper/WrapperConfigInput.cpp)
target_link_libraries(dft_wrapper_input PUBLIC dft_wrapper PRIVATE dft_analysis_input hier_warnings)
add_executable(dft-wrapper wrapper/main.cpp)
target_link_libraries(dft-wrapper PRIVATE dft_wrapper_json dft_wrapper_input hier_warnings)
add_executable(dft_wrapper_unit tests/WrapperBoundaryTest.cpp)
target_link_libraries(dft_wrapper_unit PRIVATE dft_wrapper_json hier_warnings)
target_compile_definitions(dft_wrapper_unit PRIVATE DFT_WRAPPER_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-boundary.sv")
add_test(NAME a_wrapper_boundary_unit COMMAND dft_wrapper_unit)
add_test(NAME a_wrapper_boundary_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-boundary.py" "$<TARGET_FILE:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_wrapper_boundary_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")
add_library(dft_wrapper_layering OBJECT EXCLUDE_FROM_ALL ../core/tests/layering/includes_slang.cpp)
target_link_libraries(dft_wrapper_layering PRIVATE dft_wrapper)
add_test(NAME a_wrapper_boundary_layering COMMAND ${CMAKE_COMMAND} --build ${CMAKE_BINARY_DIR} --target dft_wrapper_layering)
set_tests_properties(a_wrapper_boundary_layering PROPERTIES PASS_REGULAR_EXPRESSION "slang/ast/Compilation\\.h.*(file not found|No such file)")

add_executable(dft_wrapper_plan_unit tests/WrapperCellPlanTest.cpp)
target_link_libraries(dft_wrapper_plan_unit PRIVATE dft_wrapper_json hier_warnings)
target_compile_definitions(dft_wrapper_plan_unit PRIVATE DFT_WRAPPER_PLAN_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-cell-plan.sv")
add_test(NAME a_wrapper_plan_unit COMMAND dft_wrapper_plan_unit)
add_test(NAME a_wrapper_plan_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-cell-plan.py" "$<TARGET_FILE:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_wrapper_plan_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_wrapper_chains_unit tests/WrapperChainsTest.cpp)
target_link_libraries(dft_wrapper_chains_unit PRIVATE dft_wrapper_json hier_warnings)
target_compile_definitions(dft_wrapper_chains_unit PRIVATE DFT_WRAPPER_CHAINS_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-chains.sv")
add_test(NAME a_wrapper_chains_unit COMMAND dft_wrapper_chains_unit)
add_test(NAME a_wrapper_chains_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-chains.py" "$<TARGET_FILE:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_wrapper_chains_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_wrapper_config_unit tests/WrapperConfigTest.cpp)
target_link_libraries(dft_wrapper_config_unit PRIVATE dft_wrapper_input dft_wrapper_json hier_warnings)
target_compile_definitions(dft_wrapper_config_unit PRIVATE DFT_WRAPPER_CONFIG_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests")
add_test(NAME a_wrapper_config_unit COMMAND dft_wrapper_config_unit)
add_test(NAME a_wrapper_config_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-config.py" "$<TARGET_FILE:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_wrapper_config_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_wrapper_comparison_unit tests/WrapperComparisonTest.cpp)
target_link_libraries(dft_wrapper_comparison_unit PRIVATE dft_wrapper_json hier_warnings)
target_compile_definitions(dft_wrapper_comparison_unit PRIVATE DFT_WRAPPER_COMPARISON_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-chains.sv")
add_test(NAME a_wrapper_comparison_unit COMMAND dft_wrapper_comparison_unit)
add_test(NAME a_wrapper_comparison_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-comparison.py" "$<TARGET_FILE:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_wrapper_comparison_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_wrapper_coverage_unit tests/WrapperCoverageTest.cpp)
target_link_libraries(dft_wrapper_coverage_unit PRIVATE dft_wrapper_json hier_warnings)
target_compile_definitions(dft_wrapper_coverage_unit PRIVATE DFT_WRAPPER_COVERAGE_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-chains.sv")
add_test(NAME a_wrapper_coverage_unit COMMAND dft_wrapper_coverage_unit)
add_test(NAME a_wrapper_coverage_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-coverage.py" "$<TARGET_FILE:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_wrapper_coverage_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_wrapper_clocks_unit tests/WrapperClocksTest.cpp)
target_link_libraries(dft_wrapper_clocks_unit PRIVATE dft_wrapper_json hier_warnings)
target_compile_definitions(dft_wrapper_clocks_unit PRIVATE DFT_WRAPPER_CLOCKS_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-clocks.sv")
add_test(NAME a_wrapper_clocks_unit COMMAND dft_wrapper_clocks_unit)
add_test(NAME a_wrapper_clocks_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-clocks.py" "$<TARGET_FILE:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_wrapper_clocks_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_wrapper_resets_unit tests/WrapperResetsTest.cpp)
target_link_libraries(dft_wrapper_resets_unit PRIVATE dft_wrapper_json hier_warnings)
target_compile_definitions(dft_wrapper_resets_unit PRIVATE DFT_WRAPPER_RESETS_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-resets.sv")
add_test(NAME a_wrapper_resets_unit COMMAND dft_wrapper_resets_unit)
add_test(NAME a_wrapper_resets_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-resets.py" "$<TARGET_FILE:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_wrapper_resets_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_wrapper_compatibility_unit tests/WrapperCompatibilityTest.cpp)
target_link_libraries(dft_wrapper_compatibility_unit PRIVATE dft_wrapper_json hier_warnings)
target_compile_definitions(dft_wrapper_compatibility_unit PRIVATE DFT_WRAPPER_COMPATIBILITY_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-compatibility.sv")
add_test(NAME a_wrapper_compatibility_unit COMMAND dft_wrapper_compatibility_unit)
add_test(NAME a_wrapper_compatibility_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-compatibility.py" "$<TARGET_FILE:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_wrapper_compatibility_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_wrapper_activity_unit tests/WrapperActivityTest.cpp)
target_link_libraries(dft_wrapper_activity_unit PRIVATE dft_wrapper_json hier_warnings)
target_compile_definitions(dft_wrapper_activity_unit PRIVATE DFT_WRAPPER_ACTIVITY_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-compatibility.sv")
add_test(NAME a_wrapper_activity_unit COMMAND dft_wrapper_activity_unit)
add_test(NAME a_wrapper_activity_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-activity.py" "$<TARGET_FILE:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_wrapper_activity_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_wrapper_schedule_unit tests/WrapperScheduleTest.cpp)
target_link_libraries(dft_wrapper_schedule_unit PRIVATE dft_wrapper_json hier_warnings)
target_compile_definitions(dft_wrapper_schedule_unit PRIVATE DFT_WRAPPER_SCHEDULE_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-schedule.sv")
add_test(NAME a_wrapper_schedule_unit COMMAND dft_wrapper_schedule_unit)
add_test(NAME a_wrapper_schedule_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-schedule.py" "$<TARGET_FILE:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_wrapper_schedule_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

add_executable(dft_wrapper_explanation_unit tests/WrapperExplanationTest.cpp)
target_link_libraries(dft_wrapper_explanation_unit PRIVATE dft_wrapper_json hier_warnings)
target_compile_definitions(dft_wrapper_explanation_unit PRIVATE DFT_WRAPPER_EXPLANATION_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-compatibility.sv")
add_test(NAME a_wrapper_explanation_unit COMMAND dft_wrapper_explanation_unit)
add_test(NAME a_wrapper_explanation_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-explanation.py" "$<TARGET_FILE:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json")
set_tests_properties(a_wrapper_explanation_cli PROPERTIES TIMEOUT 120 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

# Standalone native CLI distribution; does not export the generic Core SDK.
include("${CMAKE_CURRENT_SOURCE_DIR}/wrapper/packaging/Install.cmake")
add_test(NAME a_wrapper_install_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/wrapper-install.py" "${CMAKE_BINARY_DIR}" "$<CONFIG>" "$<TARGET_FILE:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}/wrapper/packaging")
set_tests_properties(a_wrapper_install_cli PROPERTIES TIMEOUT 180 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

# All existing native consumers, with a separate data tree and manifest.
file(GLOB_RECURSE _analysis_schemas CONFIGURE_DEPENDS
  "${CMAKE_CURRENT_SOURCE_DIR}/sequential/*.schema.json"
  "${CMAKE_CURRENT_SOURCE_DIR}/objects/*.schema.json"
  "${CMAKE_CURRENT_SOURCE_DIR}/memory/*.schema.json")
dft_install_cli_component(NAME AnalysisCLI DATA dft-analysis
  FORMAT analysis-cli-manifest-v1 KIND dft-analysis-install
  MATERIALS "${CMAKE_CURRENT_SOURCE_DIR}/packaging"
  TARGETS dft-seqcheck dft-objects dft-memory dft-wrapper
  SCHEMAS ${_analysis_schemas} ${_wrapper_schemas} "${CMAKE_CURRENT_SOURCE_DIR}/../protocol/schema/hier.schema.json"
  EXAMPLES "${CMAKE_CURRENT_SOURCE_DIR}/packaging/examples" "${CMAKE_CURRENT_SOURCE_DIR}/wrapper/packaging/examples")
add_test(NAME a_analysis_install_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/analysis-install.py" "${CMAKE_BINARY_DIR}" "$<CONFIG>" "$<TARGET_FILE_DIR:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}")
set_tests_properties(a_analysis_install_cli PROPERTIES TIMEOUT 180 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

# Shared private CLI transport; existing algorithms and serializers keep their own targets.
add_library(dft_cli_output OBJECT common/CliOutput.cpp)
target_link_libraries(dft_cli_output PRIVATE hier_protocol hier_warnings)
foreach(_cli dft-seqcheck dft-objects dft-memory dft-wrapper)
  target_sources(${_cli} PRIVATE $<TARGET_OBJECTS:dft_cli_output>)
endforeach()
add_executable(dft_cli_output_unit tests/CliOutputTest.cpp $<TARGET_OBJECTS:dft_cli_output>)
target_link_libraries(dft_cli_output_unit PRIVATE hier_protocol hier_warnings)
add_test(NAME a_cli_output_unit COMMAND dft_cli_output_unit)
add_test(NAME a_cli_output_cli COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/cli-output.py" "$<TARGET_FILE_DIR:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}")
set_tests_properties(a_cli_output_cli PROPERTIES TIMEOUT 180 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")

set(_cli_test_sanitized OFF)
if(HIER_SANITIZE OR DFT_SANITIZE)
  set(_cli_test_sanitized ON)
endif()
add_test(NAME a_cli_install_paths COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/cli-install-paths.py" "$<TARGET_FILE_DIR:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}" "$<CONFIG>" "${_cli_test_sanitized}")
set_tests_properties(a_cli_install_paths PROPERTIES TIMEOUT 600 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")
add_test(NAME a_cli_bundle_repro COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/cli-bundle-repro.py" "$<TARGET_FILE_DIR:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}" "$<CONFIG>" "${_cli_test_sanitized}")
set_tests_properties(a_cli_bundle_repro PROPERTIES TIMEOUT 900 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")
add_test(NAME a_cli_install_text COMMAND "${HIER_SCHEMA_PYTHON}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/cli-install-text.py" "$<TARGET_FILE_DIR:dft-wrapper>" "${CMAKE_CURRENT_SOURCE_DIR}" "$<CONFIG>" "${_cli_test_sanitized}")
set_tests_properties(a_cli_install_text PROPERTIES TIMEOUT 600 ENVIRONMENT "PYTHONDONTWRITEBYTECODE=1")
