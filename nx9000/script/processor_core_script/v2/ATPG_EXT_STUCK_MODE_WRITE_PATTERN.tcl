#----------------------------------------------
# Write Verilog patterns for simulation
#**********************************************************************
#  SIN_PARALLEL_DELAY_SHIFT_CLOCK
#  SIN_PARALLEL_EARLY_FORCE_AND_MEASURE
#  SIN_EARLY_SCAN_RELEASE
#  SIN_EARLY_RELEASE_TIME
#  SIN_EARLY_RELEASE_TIME
write_patterns patterns/${design_name}_${current_mode}_internal_parallel_memory_bypass_enable.v.gz -end 5000 -verilog -parallel -parameter_list {SIM_TOP_NAME TB SIM_STATUS_MSG 1 SIM_KEEP_PATH 1 SIM_POST_SHIFT 8} -replace
write_patterns patterns/${design_name}_${current_mode}_internal_serial_memory_bypass_enable.v.gz -end 20 -verilog -serial -parameter_list {SIM_TOP_NAME TB SIM_STATUS_MSG 1 SIM_KEEP_PATH 1 SIM_POST_SHIFT 8} -replace
#manufacture pattern
write_patterns patterns/${design_name}_${current_mode}_internal_parallel_memory_bypass_enable.stil -stil -pattern_sets scan -parallel -replace
set_pattern_filtering -sample_per_type 2
write_patterns patterns/${design_name}_${current_mode}_internal_serial_memory_bypass_enable.stil -stil -pattern_sets scan -serial  -replace

