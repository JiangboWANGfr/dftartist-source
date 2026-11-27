#----------------------------------------------
#set_wrapper_analysis_options -exclude_ports xxxx
set_wrapper_analysis_options -register_undriven_output on
set_wrapper_analysis_options -capture_window_behavior shift

set_wrapper_analysis_options -input_fanout_flop_threshold 4
set_wrapper_analysis_options -output_fanin_flop_threshold 4
set_wrapper_analysis_options -capture_window_behavior shift

