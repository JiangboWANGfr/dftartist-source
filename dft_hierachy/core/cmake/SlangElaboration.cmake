# Local Slang v12 integration point: run frontend binding after normal elaboration,
# before semantic diagnostics are cached. Upstream sources stay untouched, including
# when FETCHCONTENT_SOURCE_DIR_SLANG points at another build's shared source checkout.
# See frontend/SHARING_VERIFIED.md and docs/plans/C52.md before updating these hashes.
function(hier_slang_elaboration_overlay)
  set(header "${slang_SOURCE_DIR}/include/slang/ast/Compilation.h")
  set(source "${slang_SOURCE_DIR}/source/ast/Compilation.cpp")
  file(SHA256 "${header}" header_hash)
  file(SHA256 "${source}" source_hash)
  if(NOT header_hash STREQUAL "fdff61304e3460ccd98191b5fef0eaa355a761ada50d40e64ecfd59b2319654c"
     OR NOT source_hash STREQUAL "11ae44ba59e54486f64d46df3b4a800af5dc3c425934e156f1c0ad05b880c664")
    message(FATAL_ERROR "Slang elaboration extension: unverified Compilation sources; review the pinned patch before building")
  endif()
  set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${header}" "${source}")
  file(READ "${header}" header_text)
  file(READ "${source}" source_text)
  string(REPLACE "#include <memory>" "#include <functional>\n#include <memory>"
    header_text "${header_text}")
  string(REPLACE "    const Diagnostics& getSemanticDiagnostics();"
    [=[    const Diagnostics& getSemanticDiagnostics();

    /// Hierarchy local extension. On the first collection only, invokes the callback
    /// synchronously after full elaboration (including instance-cache finalization),
    /// before coalescing diagnostics. It may bind extra expressions in existing scopes.
    /// It must not recursively collect diagnostics or mutate the instance hierarchy.
    /// The callback is not retained; if it throws, discard this compilation.
    const Diagnostics& getSemanticDiagnostics(const std::function<void()>& afterElaboration);]=]
    header_text "${header_text}")
  string(REPLACE "const Diagnostics& Compilation::getSemanticDiagnostics() {"
    [=[const Diagnostics& Compilation::getSemanticDiagnostics() {
    return getSemanticDiagnostics({});
}

const Diagnostics& Compilation::getSemanticDiagnostics(
    const std::function<void()>& afterElaboration) {]=]
    source_text "${source_text}")
  string(REPLACE "    cachedSemanticDiagnostics.emplace(diagMap.coalesce(sourceManager));"
    [=[    if (afterElaboration)
        afterElaboration();

    cachedSemanticDiagnostics.emplace(diagMap.coalesce(sourceManager));]=]
    source_text "${source_text}")

  set(overlay "${CMAKE_CURRENT_BINARY_DIR}/slang-elaboration")
  # file(GENERATE) preserves timestamps when content is unchanged across reconfigure.
  file(GENERATE OUTPUT "${overlay}/include/slang/ast/Compilation.h" CONTENT "${header_text}")
  file(GENERATE OUTPUT "${overlay}/Compilation.cpp" CONTENT "${source_text}")
  get_target_property(sources slang_slang SOURCES)
  list(FIND sources "${source}" source_index)
  if(source_index EQUAL -1)
    message(FATAL_ERROR "Slang elaboration extension: unexpected Compilation.cpp target layout")
  endif()
  list(REMOVE_AT sources ${source_index})
  set_property(TARGET slang_slang PROPERTY SOURCES "${sources}")
  target_sources(slang_slang PRIVATE "${overlay}/Compilation.cpp")
  # Use the same include class as upstream: a -isystem overlay would be searched
  # after upstream's -I path even with BEFORE. FetchContent marks consumer paths system.
  target_include_directories(slang_slang BEFORE PUBLIC
    "$<BUILD_INTERFACE:${overlay}/include>")
  target_include_directories(slang_slang PRIVATE "${slang_SOURCE_DIR}/source/ast")
endfunction()
hier_slang_elaboration_overlay()
