
# design
set top_design                     "processor_core"
set cl_top_rtl_list                "/home/wongw/nx9000/dft_path/processor_core/v1/7.deliver/rtl/processor_core.after_dft_ip.to_syn.f"
set cl_dft_sdc                     "/home/wongw/nx9000/dft_path/processor_core/v1/7.deliver/rtl/sdc/processor_core.dft_add_func.sdc"
set cl_func_sdc                    "/home/wongw/nx9000/design/processor_core/processor_core_design.sdc"
set cl_upf_file                    ""

# library
set search_path                    ""
set link_db                        ""
set target_db                      ""
set cl_dont_use                    "*D0BWP* *D0P*BWP* DEL* CK* *D18BWP* *D20BWP* *D24BWP* AO22D1BWP* AOAI211D1* AOI211*BD1* AOI221D1BWP* AOI222* AOI22*BD1BWP* AOI31*D1BWP* AOI32D* AOI33D* IINR4D1BWP* IAO22D1BWP* IIND4D1BWP* INR4D1BWP* IOA22D1BWP* ND4D1BWP* NR4D1BWP* AOI211D1BWP* OA22D1BWP* OAI211*D1BWP* OAI221* OAI222* OAI22*D1BWP* OAI31D1BWP* OAI32* OAI33D* OAOI211D1BWP* OR4D1BWP* MAOI* BUFT* DCCK* CMPE* *CSN* *DFK* PT* G* ANT* BHD* SEDF* EDF*"
set cl_driving_cell                "BUFFD4BWP16P90CPD"
set cl_tie_cell_pattern            "TIE*"

# compile
set cl_compile_design              "*processor_core*"
set cl_read_rtl_user_scripts       ""
set cl_pre_compile_user_scripts    ""
set cl_compile_user_scripts        ""
set cl_verification_priority       ""
set cl_multibit_mode               "0"
set cl_minimum_bitwidth            "4"
set cl_insert_output_buf           "1"
set cl_chip_level                  "0"

# clock_gating
set cl_icg_group                   "0"
set cl_icg_fanout                  "32"
set cl_icg_setup                   "0.10"
set cl_icg_exclude_cell            ""
set cl_icg_ref_name                "CKLNQD12BWP16P90CPDLVT"
set cl_icgn_ref_name               "CKLHQD12BWP16P90CPDLVT"

# timing
set cl_set_clock_latency           ""
set cl_set_clock_latecncy          ""
set cl_set_ideal_network           ""
set cl_wire_load_model             ""
set cl_wire_load_mode              ""
set cl_max_fanout                  "32"
set cl_uncertainty_clocks          ""
set cl_max_uncertainty             "0.08"
set cl_max_transition              "0.3"

# corner
set cl_min_operating_conditions    "ssgnp0p72vm40c"
set cl_max_operating_conditions    "ssgnp0p72vm40c"

# misc
set cl_size_only_cells_file        ""
set deliver                        "/home/wongw/nx9000/dft_path/processor_core/v1/7.deliver/rtl"
