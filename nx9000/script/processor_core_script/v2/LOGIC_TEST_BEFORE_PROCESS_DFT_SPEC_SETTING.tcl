###from user setting
#add yours setting if need


###from default design setting
#latch to flop\n";
set sibs [get_config_elements Sib(*) -hier]
set_config_value [get_config_elements to_scan_in_feedthrough -in_wrappers $sibs] pipeline
set_config_value $dftspec/IjtagNetwork/ImplementationOptions/scan_path_retiming flop

proc reset_post_process {root_wrapper args} {
  #set dft_ctrl_async_set_reset_dynamic_disable_or2_pin [get_name_list [get_pins -of_instance [get_instance *dft_ctrl_async_set_reset_dynamic_disable_or2* -hier] -direction output -silent] -silent]
  #if {$dft_ctrl_async_set_reset_dynamic_disable_or2_pin ne ""} {
  #   foreach pins $dft_ctrl_async_set_reset_dynamic_disable_or2_pin {
  #       add_output_pin_dft_mux_override $pins "u_dfx_dynamic_hyper_ctl/dfx_rst_scan_n" "u_dfx_static_hyper_ctl_tdr/dfx_scan_mode"
  #   }
  #}
  set dynamic_hyper_ctl_se [get_name_list [get_pins *u_dfx_dynamic_hyper_ctl/scan_enable -hier -silent] -silent]
  if {$dynamic_hyper_ctl_se ne ""} {
      delete_connection [get_pins *u_dfx_dynamic_hyper_ctl/scan_enable -hier]
      create_connection [get_pins *u_dfx_dynamic_hyper_ctl/scan_enable -hier] [get_pins [get_name_list [get_dft_signal scan_en]]]
  }
  set dynamic_hyper_ctl_async_set_reset_static_disable [get_name_list [get_pins *u_dfx_dynamic_hyper_ctl/async_set_reset_static_disable -hier -silent] -silent]
  if {$dynamic_hyper_ctl_async_set_reset_static_disable ne ""} {
      delete_connection [get_pins *u_dfx_dynamic_hyper_ctl/async_set_reset_static_disable -hier]
      create_connection [get_pins *u_dfx_dynamic_hyper_ctl/async_set_reset_static_disable -hier] [get_pins [get_name_list [get_dft_signal async_set_reset_static_disable]]]
  }           
}
register_callback process_dft_specification.post_insertion reset_post_process

###Design modify from user setting
proc user_post_process {root_wrapper args} {
#add tcl proc or script here
create_connection [get_pins tessent_persistent_cell_shift_capture_clock/ECK] [get_pins u_dfx_clk_test_testpoint_persistent_buf/A]

}
register_callback process_dft_specification.post_insertion user_post_process
