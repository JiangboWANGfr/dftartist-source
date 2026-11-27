


add_pin_constraints 0  ctest_mbist_req -both
add_pin_constraints 0  ctest_mbist_rst_b -both
add_pin_constraints 0  ctest_icg_mode -both
add_pin_constraints 0  ctest_scan_mode -both
add_pin_constraints 0  ctest_scan_pll_bypass -both
add_pin_constraints 0 ijtag_reset -both
add_pin_constraints 0 ijtag_tck -both
add_pin_constraints 0 ijtag_si -both
add_pin_constraints 0 bisr_reset -both

add_ignored_inputs ijtag* -both
add_ignored_outputs ijtag* -both

add_ignored_inputs *bisr* -revised
add_ignored_outputs *bisr* -revised

add_ignored_inputs ssn_bus* -both
add_ignored_outputs ssn_bus* -both

add_ignored_outputs bisr* -module cpu0_sys -both
add_ignored_inputs  bisr* -module cpu0_sys -both
add_ignored_outputs ijtag* -module cpu0_sys -both
add_ignored_inputs  ijtag* -module cpu0_sys -both
add_ignored_outputs ssn* -module cpu0_sys -both
add_ignored_inputs  ssn* -module cpu0_sys -both

add_ignored_outputs bisr* -module  -both
add_ignored_inputs  bisr* -module  -both
add_ignored_outputs ijtag* -module  -both
add_ignored_inputs  ijtag* -module  -both
add_ignored_outputs ssn* -module  -both
add_ignored_inputs  ssn* -module  -both

set sys_list [list pc_top]

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

