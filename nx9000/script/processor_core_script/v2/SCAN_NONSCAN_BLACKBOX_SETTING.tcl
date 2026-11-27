#----------------------------------------------
add_nonscan_instances [get_instance  *tessent_edt_*_EDT_chan_*_*_lockup_inst*]
add_nonscan_instances [get_instance  *dfx_*_edt_channels_*_pipe*]
add_nonscan_instances [get_instance u_tc10_main_wrapper/u_tc10_main_top/*u_fnoc_a3x1_u_div_ref*]
add_nonscan_instances u_tc10_main_wrapper/u_tc10_main_aon/u_pmu_top

#add_black_box  -module [get_module  *ssss*]

