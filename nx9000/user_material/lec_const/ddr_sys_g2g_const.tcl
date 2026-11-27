

add_primary_input ddr_sys_logic_test_tessent_ssn_scan_host_1_inst/scan_en -both
add_pin_constraints 0 ddr_sys_logic_test_tessent_ssn_scan_host_1_inst/scan_en -both

add_primary_input ddr_sys_logic_test_tessent_tdr_sri_ctrl_inst/tessent_persistent_cell_ext_ltest_en/Z -both
add_pin_constraints 0 ddr_sys_logic_test_tessent_tdr_sri_ctrl_inst/tessent_persistent_cell_ext_ltest_en/Z -both

add_primary_input ddr_sys_logic_test_tessent_tdr_sri_ctrl_inst/tessent_persistent_cell_int_ltest_en/Z -both
add_pin_constraints 0 ddr_sys_logic_test_tessent_tdr_sri_ctrl_inst/tessent_persistent_cell_int_ltest_en/Z -both

add_primary_input u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl* -both
#add_primary_input u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl[1] -both
#add_primary_input u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl[2] -both
#add_primary_input u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl[3] -both
#add_primary_input u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl[4] -both
#add_primary_input u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl[5] -both
#add_primary_input u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl[6] -both
#add_primary_input u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl[7] -both

add_pin_constraints 0 u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl* -both
#add_pin_constraints 0 u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl[1] -both
#add_pin_constraints 0 u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl[2] -both
#add_pin_constraints 0 u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl[3] -both
#add_pin_constraints 0 u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl[4] -both
#add_pin_constraints 0 u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl[5] -both
#add_pin_constraints 0 u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl[6] -both
#add_pin_constraints 0 u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl[7] -both


add_ignored_inputs SE* -module sr1_8192x128_wm1
add_ignored_inputs SI* -module sr1_8192x128_wm1
add_ignored_outputs SO* -module sr1_8192x128_wm1

add_ignored_inputs SE* -module sr1_8192x32_wm0
add_ignored_inputs SI* -module sr1_8192x32_wm0
add_ignored_outputs SO* -module sr1_8192x32_wm0

add_ignored_inputs ptest_scan_in* -module ddrphy
add_ignored_outputs ptest_scan_out* -module ddrphy

add_ignored_inputs ptest_scan_ddrphy_in -both
add_ignored_outputs ptest_scan_ddrphy_out -both

add_pin_constraints 0 u_ddr_wrap/u_ddrmc_top/u_ddrphy/U1/ptest_scan_se -both



