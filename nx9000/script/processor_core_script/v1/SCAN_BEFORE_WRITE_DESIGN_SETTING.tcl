#----------------------------------------------
#add later

set tp_se_list [get_name_list [get_pins SE -of_instance [get_instance u_dontouch_cell -below_instances [get_instances *_ff_inst* -below_instances u_dfx_dynamic_hyper_ctl -hierarchical]]]]
foreach tp_se $tp_se_list {
   set result [regsub -all {\s} $tp_se ""]
   delete_connection [get_pins $result] 
   create_connection [get_pins $result] [get_pins [get_name_list [get_dft_signal scan_en]]]
}
#set icg_name [get_name_list [get_instance -of_module [get_module PRE_ICG* -silent] -silent]]
#if {$icg_name ne ""} { 
#   apc_pc_ctrl $icg_name [get_intance *u_dfx_dynamic_hyper_ctl -hier]
#} else {
#   puts "Info high level Warning: there no synthesis ICG catch, please check why,it should be control else cause power and pattern count issue!!!"
#}
write_design -output_file $prj_dir/dft_path/${design_name}/$version/${design_name}_tsdb_outdir/dft_inserted_designs/${design_name}_scan.dft_inserted_design/${design_name}.vg -replace        

