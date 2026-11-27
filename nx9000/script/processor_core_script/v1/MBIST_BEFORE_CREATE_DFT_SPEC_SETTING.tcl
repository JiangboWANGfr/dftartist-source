#----------------------------------------------
####for workaround,as no PosedgeSynchronizer or PosedgeSynchronizerReset 
set_config_value /DefaultsSpecification(user)/DftSpecification/use_rtl_cells off
set_config_value /DefaultsSpecification(user)/DftSpecification/use_rtl_synchronizer_cell on
set_config_value /DefaultsSpecification(user)/DftSpecification/use_synchronizer_cell_with_reset off
set_defaults_value DftSpecification/MemoryBist/MemoryClusterOptions/memory_access_level physical
set_defaults_value DftSpecification/MemoryBist/max_steps_per_controller 2
set_defaults_value DftSpecification/MemoryBist/max_memories_per_step 30
set_defaults_value DftSpecification/MemoryBist/max_test_time_per_controller 3353988.0ns
set_defaults_value DftSpecification/MemoryBist/max_power_per_step  500
#set_defaults_value DftSpecification/MemoryBist/memory_interface_reuse_method never
set_defaults_value DftSpecification/MemoryBist/ControllerOptions/use_multicycle_paths auto
set_defaults_value DftSpecification/MemoryBist/ControllerOptions/use_multicycle_paths_period_threshold 1ns
######################################
#memory observation and bypass logic
######################################
set_defaults_value DftSpecification/MemoryBist/MemoryInterfaceOptions/data_bits_per_bypass_signal 4
set_defaults_value DftSpecification/MemoryBist/MemoryInterfaceOptions/observation_xor_size 6
#set_defaults_value DftSpecification/MemoryBist/MemoryInterfaceOptions/scan_bypass_logic none
###############################################################################################
#better for timing for high speed controller.
#set_defaults_value DftSpecification/MemoryBist/ControllerOptions/pipeline_controller_inputs on
###############################################################################################
set_defaults_value DftSpecification/MemoryBist/ControllerOptions/pipeline_controller_outputs on
#################################################
#better for diagnosis to check which memory fail.
#################################################
set_defaults_value DftSpecification/MemoryBist/DiagnosisOptions/go_status per_memory
set_defaults_value DftSpecification/MemoryBist/AlgorithmResourceOptions/data_register_bits  4 
#################################################
#standardlize for flow
#################################################
#set_defaults_value DftSpecification/IjtagNetwork/HostScanInterface/Ijtag/tck mgc_ijtag_tck
#set_defaults_value DftSpecification/IjtagNetwork/HostScanInterface/Ijtag/reset mgc_ijtag_reset
#set_defaults_value DftSpecification/IjtagNetwork/HostScanInterface/Ijtag/select mgc_ijtag_sel
#set_defaults_value DftSpecification/IjtagNetwork/HostScanInterface/Ijtag/capture_en mgc_ijtag_ce
#set_defaults_value DftSpecification/IjtagNetwork/HostScanInterface/Ijtag/shift_en mgc_ijtag_se
#set_defaults_value DftSpecification/IjtagNetwork/HostScanInterface/Ijtag/update_en mgc_ijtag_ue
#set_defaults_value DftSpecification/IjtagNetwork/HostScanInterface/Ijtag/scan_in mgc_ijtag_si
#set_defaults_value DftSpecification/IjtagNetwork/HostScanInterface/Ijtag/scan_out mgc_ijtag_so       

#add yours setting if need

report_config_data -show_default  > $prj_dir/dft_path/$design_name/$version/$script_leaf_dir/report/insertion_log/${design_name}_dft_spec_w_all_default.rpt\n";
report_dft_signals  > $prj_dir/dft_path/$design_name/$version/$script_leaf_dir/report/insertion_log/${design_name}_dft_signals.rpt\n";
report_dft_control_points  > $prj_dir/dft_path/$design_name/$version/$script_leaf_dir/report/insertion_log/${design_name}_dft_control_points.rpt\n";
report_dft_clock_enables -post_drc  > $prj_dir/dft_path/$design_name/$version/$script_leaf_dir/report/insertion_log/${design_name}_dft_clock_enables.rpt\n";
report_black_boxes > $prj_dir/dft_path/$design_name/$version/$script_leaf_dir/report/insertion_log/${design_name}_black_boxes.rpt\n";

