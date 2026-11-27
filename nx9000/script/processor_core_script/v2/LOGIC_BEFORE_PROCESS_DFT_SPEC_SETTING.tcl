#for better ijtag timing
set_defaults_value DftSpecification/IjtagNetwork/ImplementationOptions/scan_path_retiming flop
set_defaults_value DftSpecification/IjtagNetwork/to_scan_in_feedthrough_on_pb_sibs pipeline

#latch to flop
set sibs [get_config_elements Sib(*) -hier]
set_config_value [get_config_elements to_scan_in_feedthrough -in_wrappers $sibs] pipeline
set_config_value $dftspec/IjtagNetwork/ImplementationOptions/scan_path_retiming flop

###Design modify from user setting
proc user_post_process {root_wrapper args} {
#add tcl proc or script here
create_connection [get_pins tessent_persistent_cell_shift_capture_clock/ECK] [get_pins u_dfx_clk_test_testpoint_persistent_buf/A]

}
register_callback process_dft_specification.post_insertion user_post_process
