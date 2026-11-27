#add_black_box  -module [get_module  *ssss*]

#add your pin constraint here
#add_primary_input c/d/e/ltest -C1
#add_input_constraints [get_pins c/d/e/ltest] -C1
add_primary_input u_dfx_static_hyper_ctl_tdr/dfx_mode
add_input_constraints u_dfx_static_hyper_ctl_tdr/dfx_mode -C1
add_primary_input u_dfx_static_hyper_ctl_tdr/dfx_mbist_mode
add_input_constraints u_dfx_static_hyper_ctl_tdr/dfx_mbist_mode -C1

source  ../../../../dft_studio_db/${design_name}/compiled/dft_clock_define.tcl

set_quick_synthesis_options -blackbox_design_ware_modules on
set_quick_synthesis_options -skip_synthesis_of_two_dimensional_arrays_larger_than unlimited  

#add your mbist dft signal here

#add later

#dft_exclude_from_synthesis [list xxx xxx]

