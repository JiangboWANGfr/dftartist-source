#----------------------------------------------
set_split_capture_cycle on 
set_simulation_options -c6_mask_races on 
add_input_constraint -NO_Z -BIDI_Only
add_input_constraint -slow_pad
set_simulation_options -set_reset_dominate_port off
set_xclock_handling x -pessimistic_simulation on
set_simulation_options -mux_select_X_sim_X on
set_simulation_options -simulate_learned_sequential_tie_gates ON
set_bus_simulation local

