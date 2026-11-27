#----------------------------------------------
write_patterns patterns/${design_name}_${current_mode}_internal_parallel_memory_bypass_disable.v -pattern_sets scan -verilog -parallel -parameter_list {SIM_TOP_NAME TB SIM_STATUS_MSG 1 SIM_KEEP_PATH 1 SIM_POST_SHIFT 8} -replace
write_patterns patterns/${design_name}_${current_mode}_internal_serial_memory_bypass_disable.v -end 20 -pattern_sets scan -verilog -serial -parameter_list {SIM_TOP_NAME TB SIM_STATUS_MSG 1 SIM_KEEP_PATH 1 SIM_POST_SHIFT 8} -replace
#manufacture pattern
write_patterns patterns/${design_name}_${current_mode}_internal_parallel_memory_bypass_disable.bin -binary -pattern_sets scan -parallel  -replace
set_pattern_filtering -sample_per_type 2
write_patterns patterns/${design_name}_${current_mode}_internal_serial_memory_bypass_disable.stil -stil -pattern_sets scan  -serial -parameter_list {SIM_TOP_NAME TB SIM_STATUS_MSG 1 SIM_KEEP_PATH 1 SIM_POST_SHIFT 20} -replace

