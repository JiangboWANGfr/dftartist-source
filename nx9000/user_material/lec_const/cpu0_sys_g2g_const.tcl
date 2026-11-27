add_primary_input cpu0_sys_logic_test_tessent_ssn_scan_host_1_inst/scan_en -both
add_pin_constraints 0 cpu0_sys_logic_test_tessent_ssn_scan_host_1_inst/scan_en -both

add_primary_input cpu0_sys_logic_test_tessent_tdr_sri_ctrl_inst/tessent_persistent_cell_ext_ltest_en/Z -both
add_pin_constraints 0 cpu0_sys_logic_test_tessent_tdr_sri_ctrl_inst/tessent_persistent_cell_ext_ltest_en/Z -both

add_primary_input cpu0_sys_logic_test_tessent_tdr_sri_ctrl_inst/tessent_persistent_cell_int_ltest_en/Z -both
add_pin_constraints 0 cpu0_sys_logic_test_tessent_tdr_sri_ctrl_inst/tessent_persistent_cell_int_ltest_en/Z -both

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




set memlist [list \
rom_16384x32 \
sr1_1024x64_wm0 \
sr1_128x78_wm1 \
sr1_2048x39_wm1 \
sr1_512x32_wm1 \
sr1_8192x32_wm0 \
sr1_8192x8_wm0 \
sr1_512x16_wm1 \
sr1_2048x32_wm1 \
sr1_256x41_wm1 \
sr1_1024x32_wm1 \
sr1_256x4_wm1 \
sr1_256x40_wm1 \
]
foreach memcell $memlist {
add_ignored_inputs SI* -module $memcell
add_ignored_inputs SE* -module $memcell
add_ignored_outputs SO* -module $memcell
}

