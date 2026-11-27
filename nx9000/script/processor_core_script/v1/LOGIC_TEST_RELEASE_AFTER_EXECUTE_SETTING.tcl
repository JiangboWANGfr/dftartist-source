gen_full_filelist
generate_ts_synthesis -design_name $design_name -design_level $design_level 
gen_dft_vc $design_filelist ./syn_filelist $design_name $prj_path $deliver
if {$release_dir ne ""} {
    #=======================================================
    report_config_data  $dftspec > ./report/insertion_log/${design_name}.dft_spec.rpt
    set occ_dict [dict create]
    set target_tsdb_dir "../${design_name}_tsdb_outdir"
    set spec_files "./report/insertion_log/${design_name}.dft_spec.rpt"
    
    if {[llength $spec_files] > 0} {
        set spec_file [lindex $spec_files 0]
        set in_occ 0; set in_ctrl 0; set current_occ_name ""
    
        set fid [open $spec_file r]
        while {[gets $fid line] >= 0} {
            set line [string trim $line]
            if {[regexp {^OCC\s*\{} $line]} {
                set in_occ 1; continue
            }
            if {$in_occ} {
                if {[regexp {^Controller\(([^)]+)\)\s*\{} $line match ctrl_name]} {
                    set in_ctrl 1; set current_occ_name $ctrl_name; continue
                }
            }
            if {$in_ctrl} {
                if {[regexp {clock_intercept_nodes\s*:\s*(\[.+\]);} $line match nodes]} {
                    dict set occ_dict $current_occ_name [string trim $nodes]
                }
                if {[regexp {^\}} $line]} {
                    set in_ctrl 0; set current_occ_name ""; continue
                }
            } else {
                if {[regexp {^\}} $line]} {
                    set in_occ 0; continue
                }
            }
        }
        close $fid
    } else {
        puts "-> Warning: No *.dft_spec file found. Skipping OCC parse."
    }
    
    set occ_out_file "$release_dir_sdc/../${design_name}.occ.rpt"
    set fid_occ [open $occ_out_file w]
    
    if {[dict size $occ_dict] == 0} {
        puts $fid_occ " (No OCC specification data found)\n"
    } else {
        dict for {occ_name intercept_node} $occ_dict {
            puts $fid_occ " $occ_name : $intercept_node"
        }
    }
    close $fid_occ
    #=======================================================
    extract_sdc -output_file $prj_dir/dft_path/$design_name/${version}/$script_leaf_dir/report/sdc/${design_name}.sdc
    generate_release_file $deliver $prj_dir $design_name $version $script_leaf_dir 
    list_all  "$deliver/design" "$deliver/${design_name}.after_dft_ip.to_syn.f"        
    #=======================================================
    set DFT_ARTIST_HOME $env(DFT_ARTIST_HOME)
    puts "DFT_ARTIST_HOME=$DFT_ARTIST_HOME"
    set cmd [list \
        $DFT_ARTIST_HOME/lnx-x86/gen_dft_sdc \
        --target "$prj_dir/dft_path/$design_name/${version}/$script_leaf_dir/report/sdc/${design_name}.sdc" \
        --mode func \
        --level $level \
        --yaml "$prj_dir/dft_studio_db/$design_name/yaml/sdc_cfg/dft_add_func_sdc.yaml" \
        --clock-mapping "$prj_dir/dft_studio_db/$design_name/compiled/dft_clock_mapping.tcl" \
        --output "$prj_dir/dft_path/$design_name/${version}/$script_leaf_dir/report/sdc/${design_name}.dft_add_func.sdc" \
        ]
    set rc [catch {exec {*}$cmd 2>@1} result options]
    
    puts $result
    
    if {$rc != 0} {
        puts "ERROR: gen_dft_sdc failed"
        puts "errorcode = [dict get $options -errorcode]"
    } else {
        puts "INFO: gen_dft_sdc executed successfully"
    }
    #=====================================================
    set cmd [list \
        $DFT_ARTIST_HOME/lnx-x86/gen_dft_sdc \
        --target "$prj_dir/dft_path/$design_name/${version}/$script_leaf_dir/report/sdc/${design_name}.sdc" \
        --mode func \
        --level $level \
        --yaml "$prj_dir/dft_studio_db/$design_name/yaml/sdc_cfg/dft_add_func_sdc.yaml" \
        --clock-mapping "$prj_dir/dft_studio_db/$design_name/compiled/dft_clock_mapping.tcl" \
        --output "$deliver/sdc/${design_name}.dft_add_func.sdc"  \
        ]
    set rc [catch {exec {*}$cmd 2>@1} result options]
    
    puts $result
    
    if {$rc != 0} {
        puts "ERROR: gen_dft_sdc failed"
        puts "errorcode = [dict get $options -errorcode]"
    } else {
        puts "INFO: gen_dft_sdc executed successfully"
    }
    
    #=====================================================
    set cmd [list \
            $DFT_ARTIST_HOME/lnx-x86/gen_dft_sdc \
    	--target $prj_dir/dft_path/$design_name/${version}/$script_leaf_dir/report/sdc/${design_name}.sdc \
    	--mode shift \
    	--yaml $prj_dir/dft_studio_db/$design_name/yaml/sdc_cfg/shift_capture_sdc.yaml  \
    	--output "$deliver/sdc/${design_name}.shift.sdc"  \
        ]
    set rc [catch {exec {*}$cmd 2>@1} result options]
    
    puts $result
    
    if {$rc != 0} {
        puts "ERROR: gen_dft_sdc failed"
        puts "errorcode = [dict get $options -errorcode]"
    } else {
        puts "INFO: gen_dft_sdc executed successfully"
    }
    #=====================================================
    set cmd [list \
            $DFT_ARTIST_HOME/lnx-x86/gen_dft_sdc \
    	--target $prj_dir/dft_path/$design_name/${version}/$script_leaf_dir/report/sdc/${design_name}.sdc \
    	--mode stuck_at_capture \
    	--yaml $prj_dir/dft_studio_db/$design_name/yaml/sdc_cfg/shift_capture_sdc.yaml  \
    	--output "$deliver/sdc/${design_name}.stuck_at_capture.sdc"  \
        ]
    set rc [catch {exec {*}$cmd 2>@1} result options]
    
    puts $result
    
    if {$rc != 0} {
        puts "ERROR: gen_dft_sdc failed"
        puts "errorcode = [dict get $options -errorcode]"
    } else {
        puts "INFO: gen_dft_sdc executed successfully"
    }
    
    if {$release_dir_sdc ne ""} {
       exec cp -rf "$deliver/sdc/${design_name}.shift.sdc" $release_dir_sdc
       exec cp -rf "$deliver/sdc/${design_name}.stuck_at_capture.sdc" $release_dir_sdc
       exec cp -rf "$prj_dir/dft_path/$design_name/${version}/$script_leaf_dir/report/sdc/${design_name}.dft_add_func.sdc" $release_dir_sdc
    }
    set const_dir "$release_dir/impl_constraint"
    if {![file isdirectory $const_dir]} {
        exec mkdir $const_dir
        #exec cp -rf $prj_path/user_material/
        set filename "$release_dir/impl_constraint/dft.keep_boundary.list"
        set fp [open $filename "w"]
        puts $fp "*tessent*"
        close $fp
        set filename "$release_dir/impl_constraint/dft.size_only_cell.list"
        set fp [open $filename "w"]
        puts $fp "*persistent*"
        puts $fp "*dfx_*_edt_channels_*"
        puts $fp "*tessent_edt_*_EDT_chan_*_lockup_*_inst*"
        puts $fp "*u_dfx*"
        close $fp
        set filename "$release_dir/impl_constraint/dft.dont_mbit.list"
        set fp [open $filename "w"]
        puts $fp "*tessent*"
        puts $fp "*dfx_*_edt_channels_*_pipe*"
        puts $fp "*tdr*"
        puts $fp "*u_dfx*"
        puts $fp "*bisr_pipeline*"
        close $fp
    }

   set fpr2r [open "$release_dir/fv.g2g.predft_vs_postdft.constraint.do" w]
   
   set ijtag_relase_input_port [get_name_list [get_ports *ijtag* -direction input -silent]]
   if {$ijtag_relase_input_port ne ""} {
       puts $fpr2r "add_ignored_inputs *ijtag* -both"
   }
   set ijtag_relase_output_port [get_name_list [get_ports *ijtag* -direction output -silent]]
   if {$ijtag_relase_output_port ne ""} {
       puts $fpr2r "add_ignored_outputs *ijtag* -both"
   } 

   set bisr_relase_input_port [get_name_list [get_ports *bisr* -direction input -silent]]
   if {$bisr_relase_input_port ne ""} {
       puts $fpr2r "add_ignored_inputs *bisr* -both"
   }
   set bisr_relase_output_port [get_name_list [get_ports *bisr* -direction output -silent]]
   if {$bisr_relase_output_port ne ""} {
       puts $fpr2r "add_ignored_outputs *bisr* -both"
   } 

   set bscan_relase_input_port [get_name_list [get_ports *bscan* -direction input -silent]]
   if {$bscan_relase_input_port ne ""} {
       puts $fpr2r "add_ignored_inputs *bscan* -both"
   }
   set bisr_relase_output_port [get_name_list [get_ports *bscan* -direction output -silent]]
   if {$bisr_relase_output_port ne ""} {
       puts $fpr2r "add_ignored_outputs *bscan* -both"
   }         

   set ssn_relase_input_port [get_name_list [get_ports *ssn*bus* -direction input -silent]]
   if {$ssn_relase_input_port ne ""} {
       puts $fpr2r "add_ignored_inputs *ssn*bus* -both"
   }
   set ssn_relase_output_port [get_name_list [get_ports *ssn*bus* -direction output -silent]]
   if {$ssn_relase_output_port ne ""} {
       puts $fpr2r "add_ignored_outputs *ssn*bus* -both"
   }
   
   set ijtag_reset_relase_input_port [get_name_list [get_ports ijtag_reset -direction input -silent]]
   if {$ijtag_reset_relase_input_port ne ""} {
       puts $fpr2r "add_pin_constraints 0 ijtag_reset -both"
   }
   set dfx_icg_mode_relase_input_port [get_name_list [get_ports dfx_icg_mode -direction input -silent]]
   if {$dfx_icg_mode_relase_input_port ne ""} {
       puts $fpr2r "add_pin_constraints 0 dfx_icg_mode -both"
   }
   set dfx_scan_mode_relase_input_port [get_name_list [get_ports dfx_scan_mode -direction input -silent]]
   if {$dfx_scan_mode_relase_input_port ne ""} {
       puts $fpr2r "add_pin_constraints 0 dfx_scan_mode -both"
   }
   set dfx_mode_relase_input_port [get_name_list [get_ports dfx_mode -direction input -silent]]
   if {$dfx_mode_relase_input_port ne ""} {
       puts $fpr2r "add_pin_constraints 0 dfx_mode -both"
   }
   set dfx_mbist_mode_relase_input_port [get_name_list [get_ports dfx_mbist_mode -direction input -silent]]
   if {$dfx_mbist_mode_relase_input_port ne ""} {
       puts $fpr2r "add_pin_constraints 0 dfx_mbist_mode -both"
   }
   set bisr_mem_disable_relase_input_port [get_name_list [get_ports bisr_mem_disable -direction input -silent]]
   if {$dfx_mbist_mode_relase_input_port ne ""} {
       puts $fpr2r "add_pin_constraints 0 bisr_mem_disable -both"
   }

   set bscanm_relase_input_port [get_name_list [get_ports *bscan* -direction input -silent]]
   if {$bscanm_relase_input_port ne ""} {
       puts $fpr2r "add_pin_constraints 0 *bscan* -both"
   }

   set fp [open "$release_dir/fv.g2g.before_scan_vs_after_scan.constraint.do" w]
   
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
           puts $fpr2r "add_ignored_inputs SI_* -module $mod -both"
           puts $fpr2r "add_ignored_outputs SO_* -module $mod -both"
           puts $fpr2r "add_ignored_outputs CRE* -module $mod -both"
           puts $fpr2r "add_ignored_outputs FCA* -module $mod -both"
           puts $fpr2r "add_ignored_outputs DFTRAM* -module $mod -both"
           puts $fpr2r "add_ignored_outputs FCA* -module $mod -both"
       }
   } 
   if {[info exists sub_harden]} {
     foreach sub_harden_cell  $sub_harden {
        puts $fpr2r "add_ignored_inputs * -module $sub_harden_cell -both"
        puts $fpr2r "add_ignored_outputs * -module $sub_harden_cell -both"
     }
   }
   close $fpr2r
   close $fp
} 

