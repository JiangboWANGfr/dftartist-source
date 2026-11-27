#----------------------------------------------
report_scan_enable > ./report/scan_chain/${design_name}_scan_enable.rpt
report_scan_chains > ./report/scan_chain/${design_name}_scan_chain.rpt
report_scan_cells > ./report/scan_chain/${design_name}_scan_cells.rpt
report_shift_registers -verbose > ./report/scan_chain/${design_name}_shift_register_verbose.rpt
report_shift_registers -summary >> ./report/scan_chain/${design_name}_shift_register_summary.rpt
write_scan_order ./report/scan_chain/scandef_verilog -use_escaping_rule Verilog -replace
write_scan_order ./report/scan_chain/scandef_lefdef -use_escaping_rule Lefdef -replace
write_scan_order  $deliver/scandef_verilog -use_escaping_rule Verilog -replace
write_scan_order  $deliver/scandef_lefdef -use_escaping_rule Lefdef -replace
write_design -output_file $deliver/${design_name}.after_scan.vg -replace 
if {$release_dir ne ""} {
   exec cp -rf "$deliver/scandef_lefdef" $release_dir_scan_netlist
   exec cp -rf "$deliver/${design_name}.after_scan.vg" $release_dir_scan_netlist
}
set_system_mode setup
report_static_dft_signal_settings > ./report/insertion_log/${design_name}_static_dft_signal_settings.rpt
report_clocks  > ./report/insertion_log/${design_name}_test_point_stage_dft_clock.rpt
report_dft_signals > ./report/insertion_log/${design_name}_test_point_stage_dft_signals.rpt
report_dft_signal_names  > ./report/insertion_log/${design_name}_test_point_stage_dft_signal_names.rpt  
write_test_point_dofile  ./report/test_point/processor_core_tpi.dofile -all -replace

if {$release_dir ne ""} {
    exec cp -rf "$deliver/scandef_lefdef" $release_dir_scan_netlist
    exec cp -rf "$deliver/${design_name}.after_scan.vg" $release_dir_scan_netlist
    set const_dir "$release_dir/impl_constraint"

    set fp [open "$release_dir/fv.g2g.constraint.do" w]
    
    set scan_en [get_name_list [get_dft_signal scan_en]]
    puts $fp "add_primary_input $scan_en -both"
    puts $fp "add_pin_constraints 0 $scan_en -both"
    
    set ltest_en [get_name_list [get_pins -direction output -of_instances [get_instances *tessent_persistent_cell_ltest_en -h -silent] -silent]]
    set ext_ltest_en [get_name_list [get_pins -direction output -of_instances [get_instances *tessent_persistent_cell_ext_ltest_en -h -silent] -silent]]
    set int_ltest_en [get_name_list [get_pins -direction output -of_instances [get_instances *tessent_persistent_cell_int_ltest_en -h -silent] -silent]]

    set dfx_icg_mode [get_name_list [get_pins dfx_icg_mode -of_instances [get_instances *u_dfx_dynamic_hyper_ctl -h -silent] -silent]]
    set dfx_apc_cp_hyper_ctl [get_name_list [get_pins dfx_apc_cp_hyper_ctl -of_instances [get_instances *u_dfx_dynamic_hyper_ctl -h -silent] -silent]]
    
    if {$ltest_en ne ""} {
        puts $fp "add_primary_input $ltest_en -both"
        puts $fp "add_pin_constraints 0 $ltest_en -both"
    }
    if {$ext_ltest_en ne ""} {
        puts $fp "add_primary_input $ext_ltest_en -both"
        puts $fp "add_pin_constraints 0 $ext_ltest_en -both"
    }
    if {$int_ltest_en ne ""} {
        puts $fp "add_primary_input $int_ltest_en -both"
        puts $fp "add_pin_constraints 0 $int_ltest_en -both"
    }
    if {$dfx_icg_mode ne ""} {
        puts $fp "add_primary_input $dfx_icg_mode -both"
        puts $fp "add_pin_constraints 0 $dfx_icg_mode -both"
    }
    if {$dfx_apc_cp_hyper_ctl ne ""} {
        puts $fp "add_primary_input $dfx_apc_cp_hyper_ctl -both"
        puts $fp "add_pin_constraints 0 $dfx_apc_cp_hyper_ctl -both"
    }
    set target_tsdb_dir "../${design_name}_tsdb_outdir" 
    set target_files [find_files_recursive $target_tsdb_dir "${design_name}.dft_summary_dictionary"]

    if {$target_files ne ""} { 
       set fp1 [open $target_files r]
       set text [read $fp1]
       close $fp1
       
       set modules {}
       foreach line [split $text "\n"] {
           if {[regexp {template\s+/Core\(([^)]+)\)/Memory} $line -> name]} {
               lappend modules $name
           }
       }
       
       set mem_list [lsort -unique $modules]  
       foreach mod $mem_list {
           puts $fp "add_ignored_inputs SI_* -module $mod -both"
           puts $fp "add_ignored_outputs SO_* -module $mod -both"
        }
    } 

    if {[info exists sub_harden]} {
      foreach sub_harden_cell  $sub_harden {
         puts $fp "add_ignored_inputs * -module $sub_harden_cell -both"
         puts $fp "add_ignored_outputs * -module $sub_harden_cell -both"           
      }
    }
    close $fp
    set current_date [clock format [clock seconds] -format "%Y-%m-%d"]
    if {[file exists ./report/scan_chain/${design_name}_scan_cells.rpt]} {
        exec cp -rf ./report/scan_chain/${design_name}_scan_cells.rpt "$release_dir/${design_name}.${current_date}.scan_cells.rpt"
    }               
}

