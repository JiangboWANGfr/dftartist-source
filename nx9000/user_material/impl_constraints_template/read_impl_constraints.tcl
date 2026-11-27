proc cust_file2list {f} {
    set v ""
    if {[file exist $f]} {
        echo "cust_info: Reading $f"
        set fin [open $f r]
        while {[gets $fin line]>=0} {
            if {![regexp {^\s*#} $line]} {
                append v " $line "
            }
        }
        close $fin
    } else {
        echo "Warning: can't find $f"
    }
    return $v
}
  ### FUNC constraints:
        append design(keep_boundary_hinsts_list)    ""
        #append design(size_only_insts_list)         " *u_dont_* *U_DONT_TOUCH* "
        append design(size_only_insts_list)         " [get_object_name [get_cells -quiet -of_objects [get_attribute -quiet [get_clocks *] sources] -filter "is_hierarchical==false"]] "
        append design(size_only_insts_list)         ""
        append design(dont_touch_insts_list)        ""
        append design(dont_touch_nets_list)         ""
        append design(dont_mb_insts_list)           ""

    ### DFT constraints:
     if {[info exist design(impl_constraint_dft_dir)] && ($design(impl_constraint_dft_dir) ne "")} {
        append design(size_only_insts_list)          [cust_file2list $design(impl_constraint_dft_dir)/$design_name.size_only_cell.list]
        append design(dont_touch_insts_list)         [cust_file2list $design(impl_constraint_dft_dir)/$design_name.dont_touch_cell.list]
         append design(dont_touch_nets_list)          [cust_file2list $design(impl_constraint_dft_dir)/$design_name.dont_touch.dft.nets]
         append design(dont_mb_hinsts_list)           [cust_file2list $design(impl_constraint_dft_dir)/$design_name.dont_mb.dft.hinsts]
         append design(dont_clock_gating_hinsts_list) [cust_file2list $design(impl_constraint_dft_dir)/$design_name.dont_gated.list]
         append design(noscan_flop_insts_list)        [cust_file2list $design(impl_constraint_dft_dir)/$design_name.dont_scan_ff.list]
         set dft_hinsts_strict_list                   [cust_file2list $design(impl_constraint_dft_dir)/$design_name.keep_hcells.list]
     } else {
         cust_error "Please set design(impl_constraint_dft_dir) !!!"
     }

    #### dont merge flop ####
    # design(dont_mb_hinsts_list) & design(dont_mb_insts_list)
    set dont_mb_insts ""; set dont_mb_in_hinsts ""
    if {[llength $design(dont_mb_insts_list)]>0} {
        set dont_mb_insts [get_cells -hierarchical -filter "(full_name=~[regsub -all { } [join [concat $design(dont_mb_insts_list)]] { || full_name=~}]) && is_hierarchical==false && is_sequential==true"]  }

    if {[llength $design(dont_mb_hinsts_list)]>0} {
        set dont_mb_in_hinsts [get_flat_cells -of_objects [get_cells -hierarchical -filter "(full_name=~[regsub -all { } [join [concat $design(dont_mb_hinsts_list)]] { || full_name=~}]) && is_hierarchical==true"] -filter "is_sequential==true"]    }

    set design(dont_mb_inter_use) [get_object_name [get_cells "$dont_mb_insts $dont_mb_in_hinsts"]]
    if {[llength $design(dont_mb_inter_use)]>0} {
        puts "cust_info: dont merge flop insts number [llength $design(dont_mb_inter_use)]"
        remove_multibit [get_cells $design(dont_mb_inter_use)]
        set_attribute [get_cells $design(dont_mb_inter_use)] remove_multibit true
    }

    #### keep boundary ####
    # design(keep_boundary_hinsts_list)
    if {[llength $design(keep_boundary_hinsts_list)]>0} {
        set keep_boundary_hinsts [get_cells -hierarchical -filter "(full_name=~[regsub -all { } [join [concat $design(keep_boundary_hinsts_list)]] { || full_name=~}]) && is_hierarchical==true"]
    if {[sizeof_collection $keep_boundary_hinsts]>0} {
            puts "cust_info: keep boundary hinsts number [sizeof_collection $keep_boundary_hinsts]"
            set_boundary_optimization $keep_boundary_hinsts false
            set_ungroup $keep_boundary_hinsts false
        }
    }
    
    #### dont touch nets ####
    # design(dont_touch_nets_list)
    if {[llength $design(dont_touch_nets_list)]>0} {
        set dont_touch_nets [get_flat_nets -filter "(full_name=~[regsub -all { } [join [concat $design(dont_touch_nets_list)]] { || full_name=~}])"]
        if {[sizeof_collection $dont_touch_nets]>0} {
            puts "cust_info: dont touch nets number [sizeof_collection $dont_touch_nets]"
            set_dont_touch $dont_touch_nets
        }
    }
    
    #### size only insts ####
    # design(size_only_insts_list)
    if {[llength $design(size_only_insts_list)]>0} {
        set size_only_insts [get_cells -hierarchical -filter "(full_name=~[regsub -all { } [join [concat $design(size_only_insts_list)]] { || full_name=~}]) && is_hierarchical==false && (is_mapped==true || (is_mapped==false && is_sequential==true))"]
        if {[sizeof_collection $size_only_insts]>0} {
            puts "cust_info: size only insts number [sizeof_collection $size_only_insts]"
            set_size_only $size_only_insts -all_instances
        }
    }
    
    #### dont clock gating insts ####
    # design(dont_clock_gating_hinsts_list) & design(dont_clock_gating_insts_list)
    if {[llength $design(dont_clock_gating_hinsts_list)]>0} {
        set dont_clock_gating_hinsts [get_cells -hierarchical -filter "(full_name=~[regsub -all { } [join [concat $design(dont_clock_gating_hinsts_list)]] { || full_name=~}]) && is_hierarchical==true"]
    if {[sizeof_collection $dont_clock_gating_hinsts]>0} {
            puts "cust_info: dont clock gating hinsts number [sizeof_collection $dont_clock_gating_hinsts]"
            set_clock_gating_objects -exclude $dont_clock_gating_hinsts
        }
    }

    #### noscan flop hinsts ####
    # design(noscan_flop_hinsts_list) & design(noscan_flop_insts_list)
    if {[llength $design(noscan_flop_insts_list)]>0} {
        set noscan_flop_insts_list [get_cells -hierarchical -filter "(full_name=~[regsub -all { } [join [concat $design(noscan_flop_insts_list)]] { || full_name=~}]) && is_hierarchical==false && is_sequential==true"]
        if {[sizeof_collection $noscan_flop_insts_list]>0} {
            puts "cust_info: noscan flop insts number [sizeof_collection $noscan_flop_insts_list]"
            set_scan_element false $noscan_flop_insts_list
        }
    }
    
    #### dont touch insts ####
    # design(dont_touch_insts_list)
    if {[llength $design(dont_touch_insts_list)]>0} {
        set dont_touch_insts [get_cells -hierarchical -filter "(full_name=~[regsub -all { } [join [concat $design(dont_touch_insts_list)]] { || full_name=~}]) && is_hierarchical==false && is_mapped==true"]
        if {[sizeof_collection $dont_touch_insts]>0} {
            puts "cust_info: dont touch insts number [sizeof_collection $dont_touch_insts]"
            set_dont_touch $dont_touch_insts
        }
    }
    
   
    #### dft_preserve_list ####
        set syn_dc(dft_hinsts_strict_4map_inter_use) ""

        if {[info exist dft_hinsts_strict_list] && [llength $dft_hinsts_strict_list]>0} {
            set dft_strict_hinsts [get_cells -hierarchical -filter "(full_name=~[regsub -all { } [join [concat $dft_hinsts_strict_list]] { || full_name=~}]) && is_hierarchical==true"]
           if {[sizeof_collection $dft_strict_hinsts]>0} {
                set dft_strict_hinsts_name [get_object_name $dft_strict_hinsts]
				set dft_strict_hinsts_children [get_cells -hierarchical -filter "(full_name=~[regsub -all { } [join [concat $dft_strict_hinsts_name]] {/* || full_name=~}]/*) && is_hierarchical==true"]
			
			set syn_dc(dft_hinsts_strict_4map_inter_use) [get_cells "$dft_strict_hinsts $dft_strict_hinsts_children"]
               puts "cust_info: dft preserve strict hinsts number [sizeof_collection $syn_dc(dft_hinsts_strict_4map_inter_use)]"
                set_boundary_optimization $syn_dc(dft_hinsts_strict_4map_inter_use) false
                #set_compile_directives -delete_unloaded_gate false -constant_propagation false $syn_dc(dft_hinsts_strict_4map_inter_use)
                if {[sizeof_collection $syn_dc(dft_hinsts_strict_4map_inter_use)] > 0} {
                  set dft_hinsts_list [get_object_name $syn_dc(dft_hinsts_strict_4map_inter_use)] 
                  foreach dft_hinsts $dft_hinsts_list {
                      if {[string match "*tessent_edt*" $dft_hinsts] || [string match "*tessent_occ*" $dft_hinsts] || [string match "*dfx_dynamic*ff_inst*" $dft_hinsts] || [string match "*tessent_sib*" $dft_hinsts]} {
                      puts "$dft_hinsts"
                      set_compile_directives -delete_unloaded_gate false -constant_propagation false [get_cells $dft_hinsts]
                      }
                   }
                  }
                set hold_scan_cell_list [get_object_name [get_cells *hold_scan_cell*  -h ]]
                foreach hold_scan $hold_scan_cell_list {
                puts "$hold_scan"
                set_compile_directives -delete_unloaded_gate false -constant_propagation false [get_cells $hold_scan]
                }
                set_ungroup $syn_dc(dft_hinsts_strict_4map_inter_use) false
            }
        }
						  		

