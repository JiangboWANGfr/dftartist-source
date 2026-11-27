#----------------------------------------------
add_nonscan_instances [get_instance  *tessent_edt_*_EDT_chan_*_*_lockup_inst*]
add_nonscan_instances [get_instance  *dfx_*_edt_channels_*_pipe*]
add_nonscan_instances PROCESSOR_1/watchdog_0
add_nonscan_instances PROCESSOR_1/clock_module_0

#add_black_box  -module [get_module  *ssss*]

