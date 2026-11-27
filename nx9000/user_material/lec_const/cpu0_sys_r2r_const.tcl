

add_pin_constraints 0 ijtag_reset -both
add_pin_constraints 0 ijtag_tck -both
add_pin_constraints 0 ijtag_si -both
add_pin_constraints 0 bisr_reset -both
add_pin_constraints 0 ctest_scan_pll_bypass -both
add_pin_constraints 0 ctest_scan_mode -both
add_pin_constraints 0 ctest_icg_mode -both
add_pin_constraints 0 ctest_icg_scan_en -both

add_ignored_inputs ijtag* -both
add_ignored_outputs ijtag* -both

add_ignored_inputs *bisr* -both
add_ignored_outputs *bisr* -both

add_ignored_inputs ssn_bus* -both
add_ignored_outputs ssn_bus* -both

add_ignored_outputs  * -module pufrt_top -both
add_ignored_inputs  * -module pufrt_top -both

set memlist [list \
sr1_8192x32_wm0 \
sr1_8192x8_wm0 \
sr1_8192x32_wm0 \
sr1_8192x32_wm0 \
sr1_8192x8_wm0 \
sr1_8192x8_wm0 \
sr1_8192x8_wm0 \
sr1_512x32_wm1 \
sr1_128x78_wm1 \
sr1_128x78_wm1 \
sr1_128x78_wm1 \
sr1_128x78_wm1 \
sr1_2048x39_wm1 \
rom_16384x32 \
sr1_1024x64_wm0 \
sr1_8192x32_wm0 \
sr1_8192x32_wm0 \
sr1_8192x32_wm0 \
sr1_8192x8_wm0 \
sr1_8192x8_wm0 \
sr1_8192x8_wm0 \
sr1_8192x8_wm0 \
sr1_512x32_wm1 \
sr1_256x41_wm1 \
sr1_512x16_wm1 \
sr1_2048x32_wm1 \
sr1_256x41_wm1 \
sr1_1024x32_wm1 \
sr1_256x4_wm1 \
sr1_256x40_wm1 \
sr1_2048x32_wm1 \
sr1_1024x32_wm1 \
sr1_1024x32_wm1 \
sr1_1024x32_wm1 \
]
foreach memcell $memlist {
add_ignored_inputs TCEN* -module $memcell
add_ignored_inputs TWEN* -module $memcell
add_ignored_inputs TA* -module $memcell
add_ignored_inputs TD* -module $memcell
add_ignored_outputs TQ* -module $memcell
add_ignored_inputs GWEN* -module $memcell
add_ignored_inputs TGWEN* -module $memcell
add_ignored_inputs FCA* -module $memcell
add_ignored_inputs CRE* -module $memcell
}

