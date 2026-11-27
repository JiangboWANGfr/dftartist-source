set top_design                    "asic_top.after_dft_ip.to_syn.f" ; # current_design name
set cl_top_rtl_list               "/projects/yosemite/y015/85p/dft/dft_path/tt_ascalon_cluster/2.insert_edt_occ/tt_ascalon_cluster.vc_et" 
set cl_sdc                        "../sdc_dft/tt_ascalon_cluster_func.sdc"
set link_db                       {/projects/yosemite/lib/t12_9t_20_rvt/db/tcbn12ffcllbwp20p90cpdssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_20_rvt/db/tcbn12ffcllbwp20p90cpdssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_20_lvt/db/tcbn12ffcllbwp20p90cpdlvtssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_20_lvt/db/tcbn12ffcllbwp20p90cpdlvtssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_16_rvt/db/tcbn12ffcllbwp16p90cpdssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_16_rvt/db/tcbn12ffcllbwp16p90cpdssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_16_lvt/db/tcbn12ffcllbwp16p90cpdlvtssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_16_lvt/db/tcbn12ffcllbwp16p90cpdlvtssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_20_ulvt/db/tcbn12ffcllbwp20p90cpdulvtssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_20_ulvt/db/tcbn12ffcllbwp20p90cpdulvtssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_16_ulvt/db/tcbn12ffcllbwp16p90cpdulvtssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_16_ulvt/db/tcbn12ffcllbwp16p90cpdulvtssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_0rw_1r_1w_112x148_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_0rw_1r_1w_256x128_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_0rw_1r_1w_256x96_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_0rw_1r_1w_48x160_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_0rw_1r_1w_512x128_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_0rw_1r_1w_512x96_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_128x128_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_128x72_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_128x78_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_128x78_1_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_128x88_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_128x92_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_128x96_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_2048x72_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_2048x72_2_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_256x132_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_256x50_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_256x50_1_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_256x64_2_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_256x72_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_256x78_1_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_256x96_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_256x96_1_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_512x44_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_512x64_2_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_512x96_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_64x50_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_64x78_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_64x92_0_ssgnp0p72vm40c.db /projects/yosemite/lib/memory_cpu_all_final/db/mem_cell_1rw_0r_0w_64x96_0_ssgnp0p72vm40c.db /projects/yosemite/lib/pr_block_dft_final/db/tt_ascalon_core_v8_er_flat_wclg.db /projects/yosemite/lib/pr_block_dft_final/db/tt_ascalon_rv_ls_wclg.db /projects/yosemite/lib/pr_block_dft_final/db/tt_ascalon_rv_mc_wclg.db /projects/yosemite/lib/pr_block_dft_final/db/tt_ascalon_sc_partition_wclg.db /projects/yosemite/lib/pr_block_dft_final/db/tt_ascalon_sc_slice_top_wclg.db /projects/yosemite/lib/pll/db/PLLTS12FFCLAFRACF_SSGNP_0P72V_M40C.db /projects/yosemite/lib/pvt_sensor/db/mr74143_wc_vmin_m40c.db /projects/yosemite/lib/amba_div_clk_sw_cells/db/amba_div_w2_9t_wclg.db /projects/yosemite/lib/amba_div_clk_sw_cells/db/amba_div_w4_6t_wclg.db /projects/yosemite/lib/amba_div_clk_sw_cells/db/amba_div_w4_9t_wclg.db /projects/yosemite/lib/amba_div_clk_sw_cells/db/amba_div_w6_9t_wclg.db /projects/yosemite/lib/amba_div_clk_sw_cells/db/clock_switch_6t_wclg.db /projects/yosemite/lib/amba_div_clk_sw_cells/db/clock_switch_9t_wclg.db}
set target_db                     {/projects/yosemite/lib/t12_9t_20_rvt/db/tcbn12ffcllbwp20p90cpdssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_20_rvt/db/tcbn12ffcllbwp20p90cpdssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_20_lvt/db/tcbn12ffcllbwp20p90cpdlvtssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_20_lvt/db/tcbn12ffcllbwp20p90cpdlvtssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_16_rvt/db/tcbn12ffcllbwp16p90cpdssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_16_rvt/db/tcbn12ffcllbwp16p90cpdssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_16_lvt/db/tcbn12ffcllbwp16p90cpdlvtssgnp0p72vm40c_hm_lvf_p_ccs.db /projects/yosemite/lib/t12_9t_16_lvt/db/tcbn12ffcllbwp16p90cpdlvtssgnp0p72vm40c_hm_lvf_p_ccs.db}
set cl_upf_file                   ""

#other options
set cl_compile_design             "*tessent*"
set cl_read_rtl_user_scripts      ""
set cl_pre_compile_user_scripts   ""
set cl_compile_user_scripts       ""
set cl_icg_group                  "0"
set cl_verification_priority      ""
set cl_multibit_mode              "0" ; # Define 1, dc use multibit reg during compile.
set cl_set_clock_latency          ""
set cl_wire_load_model            ""
set cl_wire_load_mode             ""
set cl_icg_fanout                 "32" ;
set cl_icg_setup                  "0.10" ;
set cl_icg_exclude_cell           "" ;
set cl_set_clock_latecncy         "" ;
set cl_set_ideal_network          "" ;
set cl_size_only_cells_file       "" ;
set cl_max_fanout                 "32"
set cl_uncertainty_clocks         ""
set cl_max_uncertainty            "0.08"
set cl_max_transition             "0.3"
set cl_minimum_bitwidth           "4"
set cl_insert_output_buf          "1"
set cl_chip_level                 "0"

set cl_icg_ref_name               "CKLNQD12BWP16P90CPDLVT" ; # icg ref name
set cl_icgn_ref_name              "CKLHQD12BWP16P90CPDLVT" ; # icgn ref name
set cl_driving_cell               "BUFFD4BWP16P90CPD"
set cl_dont_use                   "*D0BWP* *D0P*BWP* DEL* CK* *D18BWP* *D20BWP* *D24BWP* AO22D1BWP* AOAI211D1* AOI211*BD1* AOI221D1BWP* AOI222* AOI22*BD1BWP* \
                                   AOI31*D1BWP* AOI32D* AOI33D* IINR4D1BWP* IAO22D1BWP* IIND4D1BWP* INR4D1BWP* IOA22D1BWP* ND4D1BWP* NR4D1BWP* AOI211D1BWP* \
                                   OA22D1BWP* OAI211*D1BWP* OAI221* OAI222* OAI22*D1BWP* OAI31D1BWP* OAI32* OAI33D* OAOI211D1BWP* OR4D1BWP* MAOI* BUFT* DCCK* CMPE* *CSN* *DFK* PT* G* ANT* BHD* SEDF* EDF*"
set cl_min_operating_conditions ssgnp0p72vm40c
set cl_max_operating_conditions ssgnp0p72vm40c
set cl_tie_cell_pattern      "TIE*"
