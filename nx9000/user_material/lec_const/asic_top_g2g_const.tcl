add_primary_input asic_top_logic_test_tessent_ssn_scan_host_1_inst/scan_en -both
add_pin_constraints 0 asic_top_logic_test_tessent_ssn_scan_host_1_inst/scan_en -both

add_primary_input asic_top_logic_test_tessent_tdr_sri_ctrl_inst/tessent_persistent_cell_ltest_en/Z -both
add_pin_constraints 0 asic_top_logic_test_tessent_tdr_sri_ctrl_inst/tessent_persistent_cell_ltest_en/Z -both

add_primary_input u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl* -both
add_pin_constraints 0 u_dfx_dynamic_hyper_ctl/dfx_apc_cp_hyper_ctl* -both


#set sys_list [list cpu_sys ddr_sys pipe_sys periph_sys]
#
#foreach sys_cell $sys_list {
#add_ignored_outputs bisr_so -module $sys_cell -revised
#add_ignored_inputs  bisr_si -module $sys_cell -revised
#add_ignored_inputs  bisr_clk -module $sys_cell -revised
#add_ignored_inputs  bisr_reset -module $sys_cell -revised
#add_ignored_inputs  bisr_shift_en -module $sys_cell -revised
#add_ignored_inputs  bisr_mem_chain_select -module $sys_cell -revised
#add_ignored_outputs ijtag* -module $sys_cell -revised
#add_ignored_inputs  ijtag* -module $sys_cell -revised
#add_ignored_outputs ssn* -module $sys_cell -revised
#add_ignored_inputs  ssn* -module $sys_cell -revised
#}

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
sr1_256x68_wm0 \
sr1_512x34_wm0 \
td2_256x32_wm0 \
td2_32x128_wm1 \
]
foreach memcell $memlist {
add_ignored_inputs SI* -module $memcell
add_ignored_inputs SE* -module $memcell
add_ignored_outputs SO* -module $memcell
}
add_ignored_inputs SCAN_IN* -module NNS28NHKCU2OPHY_P3_18FN1 -both
add_ignored_inputs SCAN_IN*  -module NNS28NHKCUPSPHY_6G_18FN1 -both

add_ignored_outputs SCAN_OUT* -module NNS28NHKCU2OPHY_P3_18FN1 -both
add_ignored_outputs SCAN_OUT*  -module NNS28NHKCUPSPHY_6G_18FN1 -both


###############
#add_ignored_inputs D -instance *ts_2_lockup_latchn* -both


