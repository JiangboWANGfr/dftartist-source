add_pin_constraints 0 PAD_ENTEST1v8   -both

add_primary_input u_top_dig/u_top_awo/u_sig_buf_bisr_rst_n/o_sig -both 
add_pin_constraints 0 u_top_dig/u_top_awo/u_sig_buf_bisr_rst_n/o_sig -both
add_primary_input u_top_dig/u_pin_mux/u_pad_ring/u_iopad_entest/C
add_pin_constraints 0  u_top_dig/u_pin_mux/u_pad_ring/u_iopad_entest/C
add_primary_input u_dfx_trstn_persistent_and_inst/Z -revised
add_pin_constraints 0 u_dfx_trstn_persistent_and_inst/Z -revised

set sys_list [list cpu_sys ddr_sys pipe_sys periph_sys]

foreach sys_cell $sys_list {
add_ignored_outputs bisr_so -module $sys_cell -revised
add_ignored_inputs  bisr_si -module $sys_cell -revised
add_ignored_inputs  bisr_clk -module $sys_cell -revised
add_ignored_inputs  bisr_reset -module $sys_cell -revised
add_ignored_inputs  bisr_shift_en -module $sys_cell -revised
add_ignored_inputs  bisr_mem_chain_select -module $sys_cell -revised
add_ignored_outputs ijtag* -module $sys_cell -revised
add_ignored_inputs  ijtag* -module $sys_cell -revised
add_ignored_outputs ssn* -module $sys_cell -revised
add_ignored_inputs  ssn* -module $sys_cell -revised
}

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
add_ignored_inputs TCEN* -module $memcell
add_ignored_inputs TWEN* -module $memcell
add_ignored_inputs TA* -module $memcell
add_ignored_inputs TD* -module $memcell
add_ignored_inputs GWEN* -module $memcell
add_ignored_inputs TGWEN* -module $memcell
add_ignored_inputs FCA* -module $memcell
add_ignored_inputs CRE* -module $memcell
}
add_ignored_inputs SCAN_CLK -module NNS28NHKCU2OPHY_P3_18FN1 -both
add_ignored_inputs SCAN_CLK  -module NNS28NHKCUPSPHY_6G_18FN1 -both


