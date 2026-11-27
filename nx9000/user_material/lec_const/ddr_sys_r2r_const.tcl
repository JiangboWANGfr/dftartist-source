add_pin_constraints 0 ctest_scan_pll_bypass -both
add_pin_constraints 0 ctest_scan_mode -both
add_pin_constraints 0 ctest_icg_mode -both
add_pin_constraints 0 ctest_bist_mode -both

add_pin_constraints 0 bisr_reset -both
add_pin_constraints 0 ijtag_reset -both
add_pin_constraints 0 ijtag_tck -both
add_pin_constraints 0 ijtag_si -both

add_ignored_inputs ijtag* -both
add_ignored_outputs ijtag* -both

add_ignored_inputs ssn_bus* -both
add_ignored_outputs ssn_bus* -both

add_ignored_inputs ptest_scan_clk -module ddrphy -both

add_ignored_inputs TCEN* -module sr1_8192x128_wm1
add_ignored_inputs TWEN* -module sr1_8192x128_wm1
add_ignored_inputs TA* -module sr1_8192x128_wm1
add_ignored_inputs TD* -module sr1_8192x128_wm1
add_ignored_inputs GWEN* -module sr1_8192x128_wm1
add_ignored_inputs TGWEN* -module sr1_8192x128_wm1

add_ignored_inputs TCEN* -module sr1_8192x32_wm0
add_ignored_inputs TWEN* -module sr1_8192x32_wm0
add_ignored_inputs TA* -module sr1_8192x32_wm0
add_ignored_inputs TD* -module sr1_8192x32_wm0
add_ignored_inputs GWEN* -module sr1_8192x32_wm0
add_ignored_inputs TGWEN* -module sr1_8192x32_wm0


