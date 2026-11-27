# --- unit tests ---
add_executable(test_filelist unit/test_filelist.cpp)
target_link_libraries(test_filelist PRIVATE hdlcore)
add_test(NAME filelist COMMAND test_filelist)

add_executable(test_libsearch unit/test_libsearch.cpp)
target_link_libraries(test_libsearch PRIVATE hdlcore)
add_test(NAME libsearch COMMAND test_libsearch ${CMAKE_SOURCE_DIR}/test/rtl/libsearch/files.f)

add_executable(test_langver unit/test_langver.cpp)
target_link_libraries(test_langver PRIVATE hdlcore)
add_test(NAME langver COMMAND test_langver ${CMAKE_SOURCE_DIR}/test/rtl/langver/sv2023.sv
                                           ${CMAKE_SOURCE_DIR}/test/rtl/langver/v2005.v)

add_executable(test_checker unit/test_checker.cpp)
target_link_libraries(test_checker PRIVATE hdlcore)
add_test(NAME checker COMMAND test_checker ${CMAKE_SOURCE_DIR}/test/rtl/checker/top.sv)

add_executable(test_genstress unit/test_genstress.cpp)
target_link_libraries(test_genstress PRIVATE hdlcore)
add_test(NAME genstress COMMAND test_genstress ${CMAKE_SOURCE_DIR}/test/rtl/genstress/genstress.sv)

add_executable(test_svfull unit/test_svfull.cpp)
target_link_libraries(test_svfull PRIVATE hdlcore)
add_test(NAME svfull COMMAND test_svfull ${CMAKE_SOURCE_DIR}/test/rtl/svfull/pkg.sv
                                         ${CMAKE_SOURCE_DIR}/test/rtl/svfull/iface.sv
                                         ${CMAKE_SOURCE_DIR}/test/rtl/svfull/top.sv)

add_executable(test_json unit/test_json.cpp)
target_include_directories(test_json PRIVATE ${CMAKE_SOURCE_DIR}/hdl-core)
add_test(NAME json COMMAND test_json)

add_executable(test_jsonvalue unit/test_jsonvalue.cpp)
target_include_directories(test_jsonvalue PRIVATE ${CMAKE_SOURCE_DIR}/hdl-core)
add_test(NAME jsonvalue COMMAND test_jsonvalue)

add_executable(test_regcount unit/test_regcount.cpp)
target_link_libraries(test_regcount PRIVATE hdlcore)
add_test(NAME regcount COMMAND test_regcount ${CMAKE_SOURCE_DIR}/test/rtl/regcount/regcount.sv)

add_executable(test_traceinto unit/test_traceinto.cpp)
target_link_libraries(test_traceinto PRIVATE hdlcore)
add_test(NAME traceinto COMMAND test_traceinto ${CMAKE_SOURCE_DIR}/test/rtl/traceinto/traceinto.sv)

add_executable(test_decompose unit/test_decompose.cpp)
target_link_libraries(test_decompose PRIVATE hdlcore)
add_test(NAME decompose COMMAND test_decompose ${CMAKE_SOURCE_DIR}/test/rtl/decompose/decompose.sv)

add_executable(test_scanbudget unit/test_scanbudget.cpp)
target_link_libraries(test_scanbudget PRIVATE hdlcore)
add_test(NAME scanbudget COMMAND test_scanbudget ${CMAKE_SOURCE_DIR}/test/rtl/regcount/regcount.sv)

add_executable(test_wrapper unit/test_wrapper.cpp)
target_link_libraries(test_wrapper PRIVATE hdlcore)
add_test(NAME wrapper COMMAND test_wrapper ${CMAKE_SOURCE_DIR}/test/rtl/wrapper/wrapper.sv)

add_executable(test_crtree unit/test_crtree.cpp)
target_link_libraries(test_crtree PRIVATE hdlcore)
add_test(NAME crtree COMMAND test_crtree ${CMAKE_SOURCE_DIR}/test/rtl/crtree/crtree.sv
                                         ${CMAKE_SOURCE_DIR}/test/rtl/crtree/crtree.sdc
                                         ${CMAKE_SOURCE_DIR}/test/rtl/crtree/stages.sv
                                         ${CMAKE_SOURCE_DIR}/test/rtl/crtree/stages_lib.yaml)

add_executable(test_sdclint unit/test_sdclint.cpp)
target_link_libraries(test_sdclint PRIVATE sdccore)
add_test(NAME sdclint COMMAND test_sdclint)

add_executable(test_clockgen unit/test_clockgen.cpp)
target_link_libraries(test_clockgen PRIVATE sdccore)
add_test(NAME clockgen COMMAND test_clockgen)

add_executable(test_ctrlgen_spec unit/test_ctrlgen_spec.cpp)
target_link_libraries(test_ctrlgen_spec PRIVATE ctrlgencore)
add_test(NAME ctrlgen_spec COMMAND test_ctrlgen_spec ${CMAKE_SOURCE_DIR}/test/fixtures/ctrlgen)

add_executable(test_ctrlgen_gen unit/test_ctrlgen_gen.cpp)
target_link_libraries(test_ctrlgen_gen PRIVATE ctrlgencore)
add_test(NAME ctrlgen_gen COMMAND test_ctrlgen_gen)

add_executable(test_genconn_jtag1838 unit/test_genconn_jtag1838.cpp)
target_link_libraries(test_genconn_jtag1838 PRIVATE genconncore)
add_test(NAME genconn_jtag1838 COMMAND test_genconn_jtag1838)

add_executable(test_specgen_jtag1838 unit/test_specgen_jtag1838.cpp)
target_link_libraries(test_specgen_jtag1838 PRIVATE specgencore)
add_test(NAME specgen_jtag1838_unit COMMAND test_specgen_jtag1838)

add_executable(test_specgen_chaingroup unit/test_specgen_chaingroup.cpp)
target_link_libraries(test_specgen_chaingroup PRIVATE specgencore)
add_test(NAME specgen_chaingroup_unit COMMAND test_specgen_chaingroup)

# --- daemon differential test vs python daemon (requires pyslang) ---
set(HDL_PY3 "/Users/jiangbowang/miniforge3/bin/python3" CACHE FILEPATH "python3 with pyslang")
add_test(NAME daemon_diff_tiny
  COMMAND ${CMAKE_COMMAND} -E env HDL=$<TARGET_FILE:hdl>
          ${HDL_PY3} ${CMAKE_SOURCE_DIR}/test/diff/daemon_diff.py ${CMAKE_SOURCE_DIR}/test/rtl/tiny)

# interface ports + netlist + params via the handcrafted SV-interface design
add_test(NAME daemon_diff_iface
  COMMAND ${CMAKE_COMMAND} -E env HDL=$<TARGET_FILE:hdl>
          ${HDL_PY3} ${CMAKE_SOURCE_DIR}/test/diff/daemon_diff.py ${CMAKE_SOURCE_DIR}/test/rtl/iface)

# computed-constant ties (unary/binary-op tie literals) via the handcrafted tie design
add_test(NAME daemon_diff_tie
  COMMAND ${CMAKE_COMMAND} -E env HDL=$<TARGET_FILE:hdl>
          ${HDL_PY3} ${CMAKE_SOURCE_DIR}/test/diff/daemon_diff.py ${CMAKE_SOURCE_DIR}/test/rtl/tie)

# ctrlgen CLI byte-golden: EMA spec -> ===FILE:=== markers vs frozen .v/.icl/.tcl fixtures
add_test(NAME ctrlgen_golden_ema
  COMMAND ${CMAKE_COMMAND} -E env CTRLGEN=$<TARGET_FILE:ctrlgen>
          bash ${CMAKE_SOURCE_DIR}/test/diff/ctrlgen_golden.sh
          ${CMAKE_SOURCE_DIR}/test/fixtures/ctrlgen/ema.spec.json
          ${CMAKE_SOURCE_DIR}/test/fixtures/ctrlgen/dfx_mem_ema_ctrl)
add_test(NAME ctrlgen_golden_pll
  COMMAND ${CMAKE_COMMAND} -E env CTRLGEN=$<TARGET_FILE:ctrlgen>
          bash ${CMAKE_SOURCE_DIR}/test/diff/ctrlgen_golden.sh
          ${CMAKE_SOURCE_DIR}/test/fixtures/ctrlgen/pll.spec.json
          ${CMAKE_SOURCE_DIR}/test/fixtures/ctrlgen/pll_ctrl_ds1)
add_test(NAME ctrlgen_golden_fuse
  COMMAND ${CMAKE_COMMAND} -E env CTRLGEN=$<TARGET_FILE:ctrlgen>
          bash ${CMAKE_SOURCE_DIR}/test/diff/ctrlgen_golden.sh
          ${CMAKE_SOURCE_DIR}/test/fixtures/ctrlgen/fuse.spec.json
          ${CMAKE_SOURCE_DIR}/test/fixtures/ctrlgen/fbi_instance_ctrl)

# --- differential test vs python oracle (requires pyslang) ---
add_test(NAME diff_tiny
  COMMAND ${CMAKE_COMMAND} -E env HDL=$<TARGET_FILE:hdl>
          bash ${CMAKE_SOURCE_DIR}/test/diff/run_diff.sh ${CMAKE_SOURCE_DIR}/test/rtl/tiny)

# --- genconn-core differential vs TS oracle (requires node + newProject) ---
find_program(HDL_NODE node)
if(HDL_NODE)
  add_test(NAME genconn_diff
    COMMAND ${CMAKE_COMMAND} -E env GENCONN=$<TARGET_FILE:genconn> NODE=${HDL_NODE}
            bash ${CMAKE_SOURCE_DIR}/test/diff/genconn_diff.sh)
  add_test(NAME genconn_inject_diff
    COMMAND ${CMAKE_COMMAND} -E env GENCONN=$<TARGET_FILE:genconn> NODE=${HDL_NODE}
            bash ${CMAKE_SOURCE_DIR}/test/diff/genconn_inject_diff.sh)
  add_test(NAME genconn_features_diff
    COMMAND ${CMAKE_COMMAND} -E env GENCONN=$<TARGET_FILE:genconn> NODE=${HDL_NODE}
            bash ${CMAKE_SOURCE_DIR}/test/diff/genconn_features_diff.sh)
  add_test(NAME specgen_diff
    COMMAND ${CMAKE_COMMAND} -E env SPECGEN=$<TARGET_FILE:specgen> NODE=${HDL_NODE}
            bash ${CMAKE_SOURCE_DIR}/test/diff/specgen_diff.sh)
  # complex-branch golden fixtures: EDT wrapper / multi-DataPath cross-seg / ExtraOutputPath / mux smux_secondary
  add_test(NAME specgen_edt_diff
    COMMAND ${CMAKE_COMMAND} -E env SPECGEN=$<TARGET_FILE:specgen> NODE=${HDL_NODE}
            DOC=${CMAKE_SOURCE_DIR}/test/fixtures/specgen_edt.doc.json
            bash ${CMAKE_SOURCE_DIR}/test/diff/specgen_diff.sh)
  add_test(NAME specgen_multidatapath_diff
    COMMAND ${CMAKE_COMMAND} -E env SPECGEN=$<TARGET_FILE:specgen> NODE=${HDL_NODE}
            DOC=${CMAKE_SOURCE_DIR}/test/fixtures/specgen_multidatapath.doc.json
            bash ${CMAKE_SOURCE_DIR}/test/diff/specgen_diff.sh)
  add_test(NAME specgen_extraoutput_diff
    COMMAND ${CMAKE_COMMAND} -E env SPECGEN=$<TARGET_FILE:specgen> NODE=${HDL_NODE}
            DOC=${CMAKE_SOURCE_DIR}/test/fixtures/specgen_extraoutput.doc.json
            bash ${CMAKE_SOURCE_DIR}/test/diff/specgen_diff.sh)
  add_test(NAME specgen_muxsecondary_diff
    COMMAND ${CMAKE_COMMAND} -E env SPECGEN=$<TARGET_FILE:specgen> NODE=${HDL_NODE}
            DOC=${CMAKE_SOURCE_DIR}/test/fixtures/specgen_muxsecondary.doc.json
            bash ${CMAKE_SOURCE_DIR}/test/diff/specgen_diff.sh)
  add_test(NAME specgen_bscan_diff
    COMMAND ${CMAKE_COMMAND} -E env SPECGEN=$<TARGET_FILE:specgen> NODE=${HDL_NODE}
            DOC=${CMAKE_SOURCE_DIR}/test/fixtures/specgen_bscan.doc.json
            bash ${CMAKE_SOURCE_DIR}/test/diff/specgen_diff.sh)
  add_test(NAME specgen_bscan_mixed_diff
    COMMAND ${CMAKE_COMMAND} -E env SPECGEN=$<TARGET_FILE:specgen> NODE=${HDL_NODE}
            DOC=${CMAKE_SOURCE_DIR}/test/fixtures/specgen_bscan_mixed.doc.json
            bash ${CMAKE_SOURCE_DIR}/test/diff/specgen_diff.sh)
  # single-IP .spec fragment (config-dialog preview): C++ generateFragment == TS genIpFragment
  add_test(NAME specgen_fragment_diff
    COMMAND ${CMAKE_COMMAND} -E env SPECGEN=$<TARGET_FILE:specgen> NODE=${HDL_NODE}
            bash ${CMAKE_SOURCE_DIR}/test/diff/specgen_fragment_diff.sh)
endif()

# slang-anchored injector: drop-in on chip.v + handles ANSI/positional/array/attrs/escaped
add_test(NAME genconn_slang_inject
  COMMAND ${CMAKE_COMMAND} -E env GENCONN=$<TARGET_FILE:genconn>
          bash ${CMAKE_SOURCE_DIR}/test/diff/genconn_slang_inject.sh
          ${CMAKE_SOURCE_DIR}/test/rtl/inject_edge)

# commercial filelist options: +define+ / +incdir+ / -f nested change the hierarchy correctly
add_test(NAME filelist_opts
  COMMAND ${CMAKE_COMMAND} -E env HDL=$<TARGET_FILE:hdl>
          bash ${CMAKE_SOURCE_DIR}/test/diff/filelist_opts.sh
          ${CMAKE_SOURCE_DIR}/test/rtl/filelist_opts)

# error tolerance: missing file / syntax error -> partial hierarchy + diagnostics, no crash
add_test(NAME tolerance
  COMMAND ${CMAKE_COMMAND} -E env HDL=$<TARGET_FILE:hdl>
          bash ${CMAKE_SOURCE_DIR}/test/diff/tolerance.sh
          ${CMAKE_SOURCE_DIR}/test/rtl/tolerance)

# L4 get-sequential: ground-truth clock/async-reset classification of handcrafted flops
add_test(NAME sequential
  COMMAND ${CMAKE_COMMAND} -E env HDL=$<TARGET_FILE:hdl>
          bash ${CMAKE_SOURCE_DIR}/test/diff/sequential.sh
          ${CMAKE_SOURCE_DIR}/test/rtl/seq)

add_test(NAME tie
  COMMAND ${CMAKE_COMMAND} -E env HDL=$<TARGET_FILE:hdl>
          bash ${CMAKE_SOURCE_DIR}/test/diff/tie.sh
          ${CMAKE_SOURCE_DIR}/test/rtl/tie)

# DFT-DRC ④.2: CLK-UNCTRL / RST-UNCTRL ground truth (undriven vs PI-threaded clock/reset)
add_test(NAME drc_unctrl
  COMMAND ${CMAKE_COMMAND} -E env DRC=$<TARGET_FILE:drc>
          bash ${CMAKE_SOURCE_DIR}/test/diff/drc.sh
          ${CMAKE_SOURCE_DIR}/test/rtl/drc)

add_executable(test_celllib unit/test_celllib.cpp)
target_link_libraries(test_celllib PRIVATE padcore)
add_test(NAME celllib COMMAND test_celllib ${CMAKE_SOURCE_DIR}/test/fixtures/pad/mini.tcelllib)

add_executable(test_padextract unit/test_padextract.cpp)
target_link_libraries(test_padextract PRIVATE padcore)
add_test(NAME padextract COMMAND test_padextract
  ${CMAKE_SOURCE_DIR}/test/rtl/pad/mini_chip.f
  ${CMAKE_SOURCE_DIR}/test/fixtures/pad/mini.tcelllib)

add_executable(test_padtable unit/test_padtable.cpp)
target_link_libraries(test_padtable PRIVATE padcore)
add_test(NAME padtable COMMAND test_padtable)

add_executable(test_padgen unit/test_padgen.cpp)
target_link_libraries(test_padgen PRIVATE padcore)
add_test(NAME padgen COMMAND test_padgen)

add_test(NAME pad_golden
  COMMAND ${CMAKE_COMMAND} -E env PAD=$<TARGET_FILE:pad>
          bash ${CMAKE_SOURCE_DIR}/test/diff/pad_golden.sh
          ${CMAKE_SOURCE_DIR}/test/fixtures/pad
          ${CMAKE_SOURCE_DIR}/test/rtl/pad)

add_test(NAME pad_serve
  COMMAND ${CMAKE_COMMAND} -E env PAD=$<TARGET_FILE:pad>
          bash ${CMAKE_SOURCE_DIR}/test/diff/pad_serve.sh
          ${CMAKE_SOURCE_DIR}/test/fixtures/pad
          ${CMAKE_SOURCE_DIR}/test/rtl/pad)

add_executable(test_dpshell unit/test_dpshell.cpp)
target_link_libraries(test_dpshell PRIVATE hdlcore)
add_test(NAME dpshell COMMAND test_dpshell ${CMAKE_SOURCE_DIR}/test/rtl/crtree/crtree.sv
                                           ${CMAKE_SOURCE_DIR}/test/rtl/crtree/crtree.sdc)






