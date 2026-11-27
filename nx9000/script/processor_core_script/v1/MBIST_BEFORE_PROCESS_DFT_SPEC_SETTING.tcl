###ijtag timing relate setting
set_defaults_value DftSpecification/IjtagNetwork/ImplementationOptions/scan_path_retiming flop
set_defaults_value DftSpecification/IjtagNetwork/to_scan_in_feedthrough_on_pb_sibs pipeline
#latch to flop
set sibs [get_config_elements Sib(*) -hier]
set_config_value [get_config_elements to_scan_in_feedthrough -in_wrappers $sibs] pipeline
set_config_value $dftspec/IjtagNetwork/ImplementationOptions/scan_path_retiming flop

###bisr relate setting
#set_config_value $spec/MemoryBist/Controller(c1)/AdvancedOptions/gate_bist_clock_in_functional_mode with_clock_gating_cell
set bisr_exist [get_name_list [get_config_elements MemoryBisr -in_wrappers $dftspec -silent]]
if {$bisr_exist ne "" && [regexp  MemoryBisr $bisr_exist]} {
    set_config_value $dftspec/MemoryBisr/Interface/scan_in                %s_bisr_si
    set_config_value $dftspec/MemoryBisr/Interface/scan_out               %s_bisr_so
    set_config_value $dftspec/MemoryBisr/Interface/capture_shift_clock    %s_bisr_clk
    set_config_value $dftspec/MemoryBisr/Interface/shift_en               %s_bisr_shift_en
    set_config_value $dftspec/MemoryBisr/Interface/reset                  %s_bisr_reset
    set_config_value $dftspec/MemoryBisr/Interface/memory_chain_select    %s_bisr_mem_chain_select
    read_config -in_wrapper $dftspec/MemoryBisr/ -rep -from_string {
       BisrElement("SegmentEnd(*)") {
           Pipeline(after) {
             so_retiming : off;
            leaf_instance_name: %s_bisr_to_client_pipeline_inst;
           }
       }
       BisrElement("SegmentStart(*)") {
           Pipeline(before) {
            leaf_instance_name: %s_bisr_from_client_pipeline_inst;
           }
       }
    }
}
 ## Memory Controller ROM setting
 #set romdict {instance} {"rom_contention_file"}
 ##dofile $prj_dir/script/common_script/rom_code_setting.tcl     

#set_config_value [get_config_element scan_bypass_logic -in $dftspec -hier] sync_mux
#set_config_value [get_config_element data_bits_per_bypass_signal -in $dftspec -hier] 5
#set_config_value [get_config_element observation_xor_size -in $dftspec -hier] 5

#Memory opset setting
set opset_list [list SyncWRvcd_HR6 SyncWRvcd_HR8 SyncWRvcd_DRDF_RTE]
dofile $prj_dir/script/common_script/mbist_controller_opset.tcl
#Memory algo setting
set extra_algo_list [list Smarch TessentHammerReadFastX TessentHammerReadFastY TessentHammerWriteFastX TessentHammerWriteFastY DAGalRow DAGalPat DAGalColumn]
set default_algo SmarchCHKBvcd 
dofile $prj_dir/script/common_script/mbist_controller_algo.tcl

#Memory Controller type check
dofile $prj_dir/script/common_script/controller_type_check.tcl          

#set_config_value $spec/MemoryBist/Controller(c1)/AdvancedOptions/gate_bist_clock_in_functional_mode with_clock_gating_cell
set bisr_exist [get_name_list [get_config_elements MemoryBisr -in_wrappers $dftspec -silent]]
if {$bisr_exist ne "" && [regexp  MemoryBisr $bisr_exist]} {
    set_config_value $dftspec/MemoryBisr/Interface/scan_in                %s_bisr_si
    set_config_value $dftspec/MemoryBisr/Interface/scan_out               %s_bisr_so
    set_config_value $dftspec/MemoryBisr/Interface/capture_shift_clock    %s_bisr_clk
    set_config_value $dftspec/MemoryBisr/Interface/shift_en               %s_bisr_shift_en
    set_config_value $dftspec/MemoryBisr/Interface/reset                  %s_bisr_reset
    set_config_value $dftspec/MemoryBisr/Interface/memory_chain_select    %s_bisr_mem_chain_select
    read_config -in_wrapper $dftspec/MemoryBisr/ -rep -from_string {
       BisrElement("SegmentEnd(*)") {
           Pipeline(after) {
             so_retiming : off;
            leaf_instance_name: %s_bisr_to_client_pipeline_inst;
           }
       }
       BisrElement("SegmentStart(*)") {
           Pipeline(before) {
            leaf_instance_name: %s_bisr_from_client_pipeline_inst;
           }
       }
    }
}
 ## Memory Controller ROM setting
 #set romdict {instance} {"rom_contention_file"}
 ##dofile $prj_dir/script/common_script/rom_code_setting.tcl     

#add yours setting if need
set_config_value $dftspec/allow_port_creation_on_current_design  on
#insert_pipeline_by_type -sib_type th -position before -levels 3 -prefix from_apb_noc_main_0_comb -dftspec $dftspec
#insert_pipeline_by_type -sib_type th -position after -levels 3 -prefix to_apb_noc_main_0_comb -dftspec $dftspec

report_config_data $dftspec
#Begin design modify
proc user_post_process {root_wrapper args} {
#add yours setting if need

}
register_callback process_dft_specification.post_insertion user_post_process
