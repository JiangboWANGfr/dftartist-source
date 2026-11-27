###from user setting
set_defaults_value DftSpecification/IjtagNetwork/ImplementationOptions/scan_path_retiming flop
set_defaults_value DftSpecification/IjtagNetwork/to_scan_in_feedthrough_on_pb_sibs pipeline

###from user setting
#add yours setting if need

###from user setting
report_config_data -show_default  > $prj_dir/dft_path/$design_name/$version/$script_leaf_dir/report/insertion_log/${design_name}_dft_spec_w_all_default.rpt\n";
report_dft_signals  > $prj_dir/dft_path/$design_name/$version/$script_leaf_dir/report/insertion_log/${design_name}_dft_signals.rpt\n";
report_dft_control_points  > $prj_dir/dft_path/$design_name/$version/$script_leaf_dir/report/insertion_log/${design_name}_dft_control_points.rpt\n";
report_dft_clock_enables -post_drc  > $prj_dir/dft_path/$design_name/$version/$script_leaf_dir/report/insertion_log/${design_name}_dft_clock_enables.rpt\n";

