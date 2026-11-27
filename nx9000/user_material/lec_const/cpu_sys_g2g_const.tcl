add_primary_input cpu_sys_logic_test_tessent_ssn_scan_host_1_inst/scan_en -both
add_pin_constraints 0 cpu_sys_logic_test_tessent_ssn_scan_host_1_inst/scan_en -both

add_primary_input cpu_sys_logic_test_tessent_tdr_sri_ctrl_inst/tessent_persistent_cell_ext_ltest_en/Z -both
add_pin_constraints 0 cpu_sys_logic_test_tessent_tdr_sri_ctrl_inst/tessent_persistent_cell_ext_ltest_en/Z -both

add_primary_input cpu_sys_logic_test_tessent_tdr_sri_ctrl_inst/tessent_persistent_cell_int_ltest_en/Z -both
add_pin_constraints 0 cpu_sys_logic_test_tessent_tdr_sri_ctrl_inst/tessent_persistent_cell_int_ltest_en/Z -both

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
rd2_128x64_wm0 \
rd2_16x122_wm0 \
rd2_16x146_wm0 \
rd2_16x154_wm0 \
rd2_16x94_wm0 \
rd2_512x68_wm0 \
rd2_8x122_wm0 \
rd2_8x82_wm0 \
sd2_128x118_wm0 \
sd2_2048x34_wm0 \
sd2_256x136_wm0 \
sd2_32x138_wm0 \
sd2_32x64_wm0 \
sd2_32x64_wm1 \
sd2_512x32_wm0 \
sd2_512x68_wm0 \
sr1_128x64_wm0 \
sr1_256x128_wm1 \
sr1_256x68_wm0 \
sr1_256x88_wm1 \
sr1_256x96_wm1 \
sr1_4096x72_wm1 \
sr1_512x34_wm0 \
td2_256x32_wm0 \
td2_32x128_wm1 \
]
foreach memcell $memlist {
add_ignored_inputs SE* -module $memcell
add_ignored_inputs SI* -module $memcell
add_ignored_outputs SO* -module $memcell
}

