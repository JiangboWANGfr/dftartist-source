report_dft_signal_names > $prj_dir/dft_path/$design_name/$version/$script_leaf_dir/report/insertion_log/${design_name}_dft_signal_names.rpt
report_dft_control_points  > $prj_dir/dft_path/$design_name/$version/$script_leaf_dir/report/insertion_log/${design_name}_dft_control_points.rpt
report_dft_clock_enables -post_drc  > $prj_dir/dft_path/$design_name/$version/$script_leaf_dir/report/insertion_log/${design_name}_dft_clock_enables.rpt
report_black_boxes > $prj_dir/dft_path/$design_name/$version/$script_leaf_dir/report/insertion_log/${design_name}_black_boxes.rpt
report_memory_dft_summary > $prj_dir/dft_path/$design_name/$version/$script_leaf_dir/report/insertion_log/${design_name}_memory_controller_power_test_time_info.rpt
gen_non_scan_instance_list  $prj_dir/dft_path/$design_name/$version/$script_leaf_dir/report/${design_name}_nonscan_instance.tcl
if {$repair_memory_list ne ""} {
    set_context patterns -ijtag
    write_memory_repair_dictionary -rep
    foreach repair_memory  $repair_memory_list {
        echo  $repair_memory  >> $prj_dir/dft_path/$design_name/$version/$script_leaf_dir/report/insertion_log/${design_name}_repair_memory_list.rpt
    }
}
if {[file exists ./report/insertion_log/${design_name}_memory_controller_power_test_time_info.rpt]} {
    exec cp -rf ./report/insertion_log/${design_name}_memory_controller_power_test_time_info.rpt "${release_dir_sdc}/../${design_name}.mem_group.rpt"
}

