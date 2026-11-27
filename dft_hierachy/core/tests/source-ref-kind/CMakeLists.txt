# Compile B's frozen consumers against the same libraries as every other test.
set(B_REF_KIND_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/../../../web/tests/independent-source-ref-kind/native")
add_executable(hier_source_ref_kind_serialization "${B_REF_KIND_SOURCE}/serialization.cpp")
target_link_libraries(hier_source_ref_kind_serialization PRIVATE hier_protocol)
add_test(NAME b_ref_kind_serialization COMMAND hier_source_ref_kind_serialization)
add_executable(hier_source_ref_kind_schema "${B_REF_KIND_SOURCE}/schema-replay.cpp")
target_include_directories(hier_source_ref_kind_schema PRIVATE "${PROJECT_SOURCE_DIR}/protocol/src")
target_link_libraries(hier_source_ref_kind_schema PRIVATE hier_protocol)
add_executable(hier_source_ref_kind_api "${B_REF_KIND_SOURCE}/CoreApi.cpp")
target_link_libraries(hier_source_ref_kind_api PRIVATE hiercore)
# Schema/API fixtures are replayed by the web standard entry after this build.

# B's original consumer is a parent project of Core. Configure that actual graph
# to catch global target collisions that a standalone Core build cannot expose.
# Share only the dependency sources, never this build's compiled outputs.
get_filename_component(HIER_REF_KIND_PRODUCT_ROOT "${PROJECT_SOURCE_DIR}/.." ABSOLUTE)
set(HIER_REF_KIND_DEPENDENCIES)
foreach(dependency slang catch2 fmt boost_regex mimalloc tomlplusplus)
  # GetProperties leaves the output untouched when an optional dependency was
  # not populated. Do not reuse the previous dependency's source directory.
  set(dependency_source "")
  FetchContent_GetProperties(${dependency} SOURCE_DIR dependency_source)
  string(TOUPPER "${dependency}" dependency_upper)
  if(dependency_source)
    list(APPEND HIER_REF_KIND_DEPENDENCIES
      "-DFETCHCONTENT_SOURCE_DIR_${dependency_upper}=${dependency_source}")
  else()
    # Remove stale overrides when reconfiguring an existing child build tree.
    list(APPEND HIER_REF_KIND_DEPENDENCIES
      "-UFETCHCONTENT_SOURCE_DIR_${dependency_upper}")
  endif()
endforeach()
add_test(NAME a_source_ref_kind_nested_configure
  COMMAND "${CMAKE_COMMAND}" -S "${B_REF_KIND_SOURCE}"
    -B "${CMAKE_CURRENT_BINARY_DIR}/nested-consumer" -G "${CMAKE_GENERATOR}"
    "-DHIER_PRODUCT=${HIER_REF_KIND_PRODUCT_ROOT}"
    "-DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE}" "-DHIER_SANITIZE=${HIER_SANITIZE}"
    "-DSLANG_USE_MIMALLOC=${SLANG_USE_MIMALLOC}"
    "-DCMAKE_CXX_COMPILER=${CMAKE_CXX_COMPILER}"
    ${HIER_REF_KIND_DEPENDENCIES})
set_tests_properties(a_source_ref_kind_nested_configure PROPERTIES TIMEOUT 120 RUN_SERIAL TRUE)

# Exercise actual parent/child cache transitions in an owned temporary tree.
# The driver runs only the named configure gate, never a recursive full CTest.
add_test(NAME a_source_ref_kind_configure_regression
  COMMAND "${Python3_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/configure-regression.py"
    --cmake "${CMAKE_COMMAND}" --ctest "${CMAKE_CTEST_COMMAND}"
    --source "${PROJECT_SOURCE_DIR}" --work-root "${CMAKE_CURRENT_BINARY_DIR}"
    --generator "${CMAKE_GENERATOR}" --compiler "${CMAKE_CXX_COMPILER}"
    --build-type "${CMAKE_BUILD_TYPE}" --sanitize "${HIER_SANITIZE}"
    --allocator "$<IF:$<BOOL:${SLANG_USE_MIMALLOC}>,ON,OFF>"
    -- ${HIER_REF_KIND_DEPENDENCIES})
set_tests_properties(a_source_ref_kind_configure_regression PROPERTIES TIMEOUT 180 RUN_SERIAL TRUE)
