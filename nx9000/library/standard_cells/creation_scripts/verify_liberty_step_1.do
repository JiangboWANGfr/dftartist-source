set_debug_control +cell_library/no_statetable_models

read_liberty ../liberty/adk.lib
write_cell_library  verify_liberty_step_1.atpglib -include_liberty_models -rep
exit

