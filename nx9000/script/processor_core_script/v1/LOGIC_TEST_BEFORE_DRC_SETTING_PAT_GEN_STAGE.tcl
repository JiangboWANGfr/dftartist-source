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

#set_static_dft_signal_value -all ltest_en 1

#set_static_dft_signal_values tck_occ_en 1

#add_nonscan_instances [get_instance  *dfx_*_edt_channels_*_pipe*]

#dft_exclude_from_synthesis [list xxx xxx]  

