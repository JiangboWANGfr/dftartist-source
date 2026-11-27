# ---- generated from the scan budget; regenerate rather than edit ----
register_attribute -name is_occ   -obj_type scan_element -value_type boolean
register_attribute -name is_hyper -obj_type scan_element -value_type boolean
set_attribute_value [get_scan_element -below_instances [get_name_list [get_instance *tessent_occ* -h]]] -name is_occ
set_attribute_value [get_scan_element -below_instances [get_name_list [get_instance *hyper* -h]]] -name is_hyper

create_scan_chain_family OCC_CHAIN -include_elements [get_scan_element * -filter "is_occ"] -chain_length unlimited
create_scan_chain_family HYPER_CHAIN -include_elements [get_scan_element * -filter "is_hyper"] -chain_length unlimited
create_scan_chain_family INT_CHAIN -include_elements [get_scan_element * -filter "!is_occ && !is_hyper"] \
     -chain_length unlimited

# int_edt: 1812 scan cells -> 5 chains of ~360-440
add_scan_mode int_edt_mode -type internal -include_chain_families [list INT_CHAIN OCC_CHAIN HYPER_CHAIN] \
     -include_elements [get_scan_elements -filter "class == wrapper"] \
     -enable_dft_signal int_edt_mode \
     -edt_instances [get_name_list [get_instance -of_icl_instances [get_name_list [get_icl_instances -filter "name =~ *int_edt* && tessent_instrument_type==mentor::edt"]]]] \
     -single_class_chains on -single_clock_domain_chains off -single_clock_edge_chains on \
     -single_wrapper_type_chains on -si_lockup_cell_type flop

# ext_edt: 337 scan cells -> 2 chains of ~270-330
add_scan_mode ext_edt_mode -type external -include_chain_families [list OCC_CHAIN HYPER_CHAIN] \
     -include_elements [get_scan_elements -filter "class == wrapper"] \
     -enable_dft_signal ext_edt_mode \
     -edt_instances [get_name_list [get_instance -of_icl_instances [get_name_list [get_icl_instances -filter "name =~ *ext_edt* && tessent_instrument_type==mentor::edt"]]]] \
     -single_class_chains on -single_clock_domain_chains off -single_clock_edge_chains on \
     -single_wrapper_type_chains on -si_lockup_cell_type flop

