include("${CMAKE_CURRENT_LIST_DIR}/../../packaging/Install.cmake")
file(GLOB _wrapper_schemas CONFIGURE_DEPENDS "${CMAKE_CURRENT_LIST_DIR}/../*.schema.json")
dft_install_cli_component(NAME WrapperCLI DATA dft-wrapper
  FORMAT wrapper-cli-manifest-v1 KIND dft-wrapper-install
  MATERIALS "${CMAKE_CURRENT_LIST_DIR}"
  TARGETS dft-wrapper
  SCHEMAS ${_wrapper_schemas}
    "${CMAKE_CURRENT_LIST_DIR}/../../sequential/logic-report.schema.json"
    "${CMAKE_CURRENT_LIST_DIR}/../../../protocol/schema/hier.schema.json"
  EXAMPLES "${CMAKE_CURRENT_LIST_DIR}/examples")
