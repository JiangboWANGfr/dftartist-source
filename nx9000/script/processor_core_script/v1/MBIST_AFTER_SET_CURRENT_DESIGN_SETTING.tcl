#----------------------------------------------
set_system_mode insertion

source $prj_path/user_material/dfx_ip/dfx_static_dynamic_ctl.tcl
#source $prj_path/user_material/design_modify/processor_core/ref0_clk_pad_ctl.tcl
#source /proj/TC10d/wa/jack/tc10/DE2.6/user_material/design_modify/processor_core/dfx_mem_ema_ctrl.tcl
#source $prj_path/user_material/dfx_ip/testability_ctl.tcl
set scan_mode_port [get_name_list [get_port scan_mode -silent]]
set mbist_mode_port [get_name_list [get_port mbist_mode -silent]]
set TM_port [get_name_list [get_port TM -silent]]
if {$scan_mode_port ne ""} {
   add_input_port_dft_mux_override $scan_mode_port u_dfx_static_hyper_ctl_tdr/dfx_scan_mode  u_dfx_static_hyper_ctl_tdr/dfx_mode
}
if {$TM_port ne ""} {
   add_input_port_dft_mux_override $TM_port u_dfx_static_hyper_ctl_tdr/dfx_scan_mode  u_dfx_static_hyper_ctl_tdr/dfx_mode
}
if {$mbist_mode_port ne ""} {
   add_input_port_dft_mux_override $mbist_mode_port u_dfx_static_hyper_ctl_tdr/dfx_mbist_mode  u_dfx_static_hyper_ctl_tdr/dfx_mode
}

write_design -output_directory pre_mbist -verbose -replace
set_system_mode setup
