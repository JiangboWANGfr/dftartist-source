set search_path    ""
set link_library   ""
set target_library ""
set synthetic_library [list standard.sldb dw_foundation.sldb]
set compile_automatic_clock_phase_inference none
set compile_seqmap_enable_output_inversion true
set bus_dimension_separator_style          {][]
set bus_inference_style                    {%s[%d]}
set bus_naming_style                       {%s[%d]}
set bus_range_separator_style              ":"
set hdlout_internal_busses                 "false"
set verilogout_equation                    "false"
set verilogout_higher_designs_first        "false"
set verilogout_ignore_case                 "true"
set verilogout_no_negative_index           "true"
set verilogout_no_tri                      "true"
set verilogout_show_unconnected_pins       "true"
set verilogout_single_bit                  "false"
set verilogout_unconnected_prefix          "SYNOPSYS_UNCONNECTED_"

set change_names_dont_change_bus_members    "false"
set change_names_update_inst_tree          "true"
set uniquify_naming_style                  "%s_%d"

set compile_seqmap_propagate_constants false

set_app_var ungroup_keep_original_design true
set dont_use_list [list *D0BWP* *D0P*BWP* DEL* CK* *D18BWP* *D20BWP* *D24BWP* AO22D1BWP* AOAI211D1* AOI211*BD1* AOI221D1BWP* AOI222* AOI22*BD1BWP* AOI31*D1BWP* AOI32D* AOI33D* IINR4D1BWP* IAO22D1BWP* IIND4D1BWP* INR4D1BWP* IOA22D1BWP* ND4D1BWP* NR4D1BWP* AOI211D1BWP* OA22D1BWP* OAI211*D1BWP* OAI221* OAI222* OAI22*D1BWP* OAI31D1BWP* OAI32* OAI33D* OAOI211D1BWP* OR4D1BWP* MAOI* BUFT* DCCK* CMPE* *CSN* *DFK* PT* G* ANT* BHD* SEDF* EDF*]
foreach dont_use $dont_use_list {
   echo "[get_attribute [get_lib_cells $dont_use full_name]" 
   set_dont_use [get_lib_cells ${dont_use}]
   set_dont_use -power [get_lib_cells ${dont_use}]
}
set deliver                        "/home/wongw/nx9000/dft_path/processor_core/v1/7.deliver/rtl"
