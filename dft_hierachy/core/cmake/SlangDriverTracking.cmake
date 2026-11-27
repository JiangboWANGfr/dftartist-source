# Build-local Slang v12 driver tracking extension. Keep the complete interval tree
# and original diagnostics; avoid its pairwise scan only when no pair can matter.
# The private state changes Slang's internal ABI: all static consumers must use the
# generated header and be rebuilt together. Upstream sources remain read-only.
function(hier_slang_driver_tracking_overlay)
  set(header "${slang_SOURCE_DIR}/include/slang/analysis/DriverTracker.h")
  set(source "${slang_SOURCE_DIR}/source/analysis/DriverTracker.cpp")
  foreach(path IN ITEMS "${header}" "${source}")
    if(NOT EXISTS "${path}")
      message(FATAL_ERROR "Slang driver tracking extension: missing pinned source ${path}")
    endif()
  endforeach()
  file(SHA256 "${header}" header_hash)
  file(SHA256 "${source}" source_hash)
  if(NOT header_hash STREQUAL "44ecd8c0d80f9a76bcede3539c6c24932a885cb53d3cd1a6182cf433c5dffaad"
     OR NOT source_hash STREQUAL "b92f4a2107d562956be2612926dc3afbeb1777cb0fa95ed34a3e01b1ac553e68")
    message(FATAL_ERROR "Slang driver tracking extension: unverified DriverTracker sources; review the pinned patch before building")
  endif()
  set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${header}" "${source}")
  file(READ "${header}" header_text)
  file(READ "${source}" source_text)
  string(REPLACE "    using HierPortDriver = InstanceDriverState::HierPortDriver;"
    [=[    using HierPortDriver = InstanceDriverState::HierPortDriver;

    // The map and category summary are updated under the same symbolDrivers visitor
    // lock. Keep every driver, including initializers and indirect port drivers.
    struct SymbolDriverState {
        SymbolDriverMap drivers;
        unsigned categories = 0;
    };]=]
    header_text "${header_text}")
  string(REPLACE "SymbolDriverMap& driverMap" "SymbolDriverState& state"
    header_text "${header_text}")
  string(REPLACE "concurrent_map<const ast::ValueSymbol*, SymbolDriverMap> symbolDrivers;"
    "concurrent_map<const ast::ValueSymbol*, SymbolDriverState> symbolDrivers;"
    header_text "${header_text}")

  string(REPLACE "item.second.begin(); it != item.second.end()"
    "item.second.drivers.begin(); it != item.second.drivers.end()"
    source_text "${source_text}")
  string(REPLACE "SymbolDriverMap& driverMap, const ValueDriver& driver,"
    "SymbolDriverState& state, const ValueDriver& driver,"
    source_text "${source_text}")
  string(REPLACE
    [=[    auto& symbol = driver.getSymbol();
    auto bounds = driver.getBounds();]=]
    [=[    auto& driverMap = state.drivers;
    auto insertDriver = [&](const ValueDriver& value) {
        driverMap.insert(value.getBounds(), &value, driverAlloc);
        state.categories |= value.isUnidirectionalPort() ? 1u : 2u;
    };
    auto& symbol = driver.getSymbol();
    auto bounds = driver.getBounds();]=]
    source_text "${source_text}")
  string(REPLACE "driverMap.insert(bounds, &driver, driverAlloc);" "insertDriver(driver);"
    source_text "${source_text}")
  string(REPLACE "driverMap.insert(initDriver->getBounds(), initDriver, driverAlloc);"
    "insertDriver(*initDriver);" source_text "${source_text}")
  string(REPLACE "    const bool allowDupInitialDrivers = context.manager->hasFlag("
    [=[    // The original loop can only report a problem for different port categories
    // or checkOverlap. A homogeneous category on a resolved net has no work to do.
    // Mixed categories and all restricted symbol types retain the original loop.
    const unsigned category = driver.isUnidirectionalPort() ? 1u : 2u;
    if (!checkOverlap && state.categories == category) {
        insertDriver(driver);
        return;
    }

    const bool allowDupInitialDrivers = context.manager->hasFlag(]=]
    source_text "${source_text}")

  set(overlay "${CMAKE_CURRENT_BINARY_DIR}/slang-driver-tracking")
  # Unchanged generated files keep their timestamps during subsequent configuration.
  file(GENERATE OUTPUT "${overlay}/include/slang/analysis/DriverTracker.h" CONTENT "${header_text}")
  file(GENERATE OUTPUT "${overlay}/DriverTracker.cpp" CONTENT "${source_text}")
  get_target_property(sources slang_slang SOURCES)
  list(FIND sources "${source}" source_index)
  # Unlike Compilation.cpp (added by the ast subdirectory), upstream lists this
  # source relative to the directory that creates slang_slang.
  if(source_index EQUAL -1)
    get_target_property(target_directory slang_slang SOURCE_DIR)
    file(REAL_PATH "${target_directory}/analysis/DriverTracker.cpp" target_source)
    file(REAL_PATH "${source}" expected_source)
    if(target_source STREQUAL expected_source)
      list(FIND sources "analysis/DriverTracker.cpp" source_index)
    endif()
  endif()
  if(source_index EQUAL -1)
    message(FATAL_ERROR "Slang driver tracking extension: unexpected DriverTracker.cpp target layout")
  endif()
  list(REMOVE_AT sources ${source_index})
  set_property(TARGET slang_slang PROPERTY SOURCES "${sources}")
  target_sources(slang_slang PRIVATE "${overlay}/DriverTracker.cpp")
  target_include_directories(slang_slang BEFORE PUBLIC
    "$<BUILD_INTERFACE:${overlay}/include>")
endfunction()
hier_slang_driver_tracking_overlay()
