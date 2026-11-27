#----------------------------------------------
register_attribute -name is_occ -obj_type scan_element -value_type boolean
set_attribute_value  [get_scan_element -below_instances [get_name_list [get_instance *tessent_occ* -h]]] -name is_occ

register_attribute -name is_hyper -obj_type scan_element -value_type boolean
set_attribute_value  [get_scan_element -below_instances [get_name_list [get_instance *u_dfx_dynamic_hyper_ctl -h]]] -name is_hyper

register_attribute -name is_int -obj_type scan_element -value_type boolean
set_attribute_value  [get_scan_element * -filter "!is_occ && !is_hyper"] -name is_int

create_scan_chain_family OCC_CHAIN -chain_length unlimited  -include_elements [get_scan_element * -filter "is_occ"]
create_scan_chain_family HYPER_CHAIN -chain_length unlimited  -include_elements [get_scan_element * -filter "is_hyper"]
create_scan_chain_family INT_CHAIN -chain_length unlimited  -include_elements [get_scan_element * -filter "!is_occ && !is_hyper"] 

add_scan_mode int_edt_mode  -single_clock_edge_chains on -include_chain_families [list INT_CHAIN OCC_CHAIN HYPER_CHAIN] -single_wrapper_type_chains on -single_clock_domain_chains off -edt_instances [get_name_list [get_instance -of_icl_instances [get_name_list [get_icl_instances -filter "name=~ *INT_EDT* && tessent_instrument_type==mentor::edt"]]]] -si_lockup_cell_type flop -single_class_chains on -type internal -enable_dft_signal int_edt_mode

add_scan_mode ext_edt_mode  -single_clock_edge_chains on -include_chain_families [list OCC_CHAIN HYPER_CHAIN] -single_wrapper_type_chains on -single_clock_domain_chains off -include_elements [get_scan_elements -filter "class == wrapper"] -edt_instances [get_name_list [get_instance -of_icl_instances [get_name_list [get_icl_instances -filter "name=~ *EXT_EDT* && tessent_instrument_type==mentor::edt"]]]] -si_lockup_cell_type flop -single_class_chains on -type external -enable_dft_signal ext_edt_mode 

