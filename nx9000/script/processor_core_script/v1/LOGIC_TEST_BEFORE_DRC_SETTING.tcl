#add_black_box  -module [get_module  *ssss*]      

add_primary_input u_dfx_static_hyper_ctl_tdr/dfx_hyper_ctl_ff_init
add_input_constraints u_dfx_static_hyper_ctl_tdr/dfx_hyper_ctl_ff_init -c1
add_primary_input u_dfx_static_hyper_ctl_tdr/dfx_rst_tdr_n
add_input_constraints u_dfx_static_hyper_ctl_tdr/dfx_rst_tdr_n -c1
add_primary_input u_dfx_static_hyper_ctl_tdr/dfx_scan_mode
add_input_constraints u_dfx_static_hyper_ctl_tdr/dfx_scan_mode -c1
add_primary_input u_dfx_dynamic_hyper_ctl/dfx_rst_scan_n
add_input_constraints u_dfx_dynamic_hyper_ctl/dfx_rst_scan_n -c1     

add_clock 0 u_dfx_clk_test_testpoint_persistent_buf/Z  -label clk_test_testpoint_100M -period 10ns

add_dft_signal int_mode ext_mode int_ltest_en ext_ltest_en 

set_insertion_options -auto_uniquify_edited_modules on -edited_module_prefix "${design_name}_"

add_dft_signal async_set_reset_static_disable
add_dft_signal ltest_en
add_dft_signal edt_clock shift_capture_clock -create_from_other_signals
add_dft_signal async_set_reset_dynamic_disable -create_from_other_signals -add_hold_scan_cell on
add_dft_signal observe_test_point_en control_test_point_en -add_hold_scan_cell on
add_dft_signal tck_occ_en memory_bypass_en int_edt_mode ext_edt_mode int_mode ext_mode
set_drc_handling DFT_C9 -auto_fix off

#set_static_dft_signal_value -all ltest_en 1

#set_static_dft_signal_values tck_occ_en 1

#add_nonscan_instances [get_instance  *dfx_*_edt_channels_*_pipe*]

#set_static_dft_signal_values tck_occ_en 1

#dft_exclude_from_synthesis [list xxx xxx]  

