#----------------------------------------------
set_wrapper_analysis_options -input_fanout_flop_threshold 4
set_wrapper_analysis_options -output_fanin_flop_threshold 4
set_wrapper_analysis_options -capture_window_behavior shift

#set_wrapper_analysis_options -exclude_ports xxxx
set_wrapper_analysis_options -register_undriven_output on
set_wrapper_analysis_options -capture_window_behavior shift

analyze_wrapper_cells
report_wrapper_analysis_options > ./report/scan_chain/${design_name}_wrapper_analysis_options.rpt
report_dedicated_wrapper_cell_options > ./report/scan_chain/${design_name}_dedicated_wrapper_cell_options.rpt
report_wrapper_cells -verbose > ./report/scan_chain/${design_name}_wrapper_cell_verbose.rpt
report_wrapper_cells -summary  > ./report/scan_chain/${design_name}_wrapper_cell_summary.rpt

