#----------------------------------------------
set_test_point_types {lbist_test_coverage edt_pattern_count}
set_test_point_analysis_options -total_number 1%
set_test_point_analysis_options -shared_observe_points_per_flop 5
set_test_point_analysis_options -test_coverage_target 99.5
set_test_point_insertion_options -observe_point_enable [get_dft_signal observe_test_point_en]
set_test_point_insertion_options -control_point_enable [get_dft_signal control_test_point_en]        

