# Global settings {{{
foreach {attrName attrValue} {
    hdl_bidirectional_assign false
    bus_naming_style {%s(%d)}
    uniquify_naming_style {%s_%d}
    hdl_auto_async_set_reset true
    init_blackbox_for_undefined true
    write_vlog_top_module_first true
    remove_assigns false
    minimize_uniquify true
    continue_on_error false
    log_command_error true
    report_tcl_command_error true
  } {
  dict set global_attributes_dict $attrName $attrValue
  set_db $attrName $attrValue
}

# In reserve - those have global impact.
# The related 'inst' or 'module' attributes may have to 
# be set appropriately for the instances that can be optimized or NOT.
# The 'auto_ungroup none' is really a last resort one...
set additional_attributes_dict {
  auto_ungroup none
  optimize_merge_flops false
  optimize_merge_latches false
  optimize_constant_latches false
  optimize_constant_0_flops false
  optimize_constant_1_flops false
}

puts "Global attributes"
foreach attrName [lsort [dict keys $global_attributes_dict]] {
  puts "  $attrName [get_db $attrName]"
}

variable legacy_behavior [expr {1.0*[get_db program_major_version] < 18.0}]
if { !$legacy_behavior } {
  foreach {attrName attrValue} {
      optimize_constant_feedback_seqs false
    } { 
    set_db / .$attrName $attrValue
  }
}
# }}}

# genus generic synthesis procs.
proc do_set_boundary_optimization { instances_collection state } {
  if { [sizeof_collection $instances_collection] == 0 } { return }
  puts "Modules of the instances"
  set modules_collection [get_db $instances_collection .module]
  puts "  [join $modules_collection "\n  "]"
  # Perserve all instances, even those on which boundary optimization is requested.
  set_db $instances_collection .ungroup_ok false

  if { !$state } {
    # Boundary optimization is avoided for all modules of the instances.
    #  - Preserve the footprint of all the pins.
    #  - Don't propagate constant inputs while optimizing the internal logic.
    #  - Don't consider any input of opposite polarity.
    set_db $modules_collection .boundary_opto strict_no
  }
}

proc do_set_size_only { instances_collection } {
  if { [sizeof_collection $instances_collection] == 0 } { return }
  foreach {preserveValue isSequential} [list map_size_ok true size_ok false] {
    set instancesFiltered [filter_collection $instances_collection "is_sequential==$isSequential"]
    if { [llength $instancesFiltered] == 0 } { continue }
    puts "\nSetting preserve attribute '$preserveValue' to '$isSequential' on:"
    set_db $instancesFiltered .preserve $preserveValue
  }
}

proc do_elaborate { design_name } {
  elaborate $design_name
  vcd designs/$design_name
}

proc do_compile { args } {
 variable legacy_behavior
 if { $legacy_behavior && 
      [llength [set allInstances [vfind . -inst *]]] > 0 && 
      [llength [set seqInstances [get_db $allInstances -if {.is_sequential==true}]]] } {
   set_db $seqInstances .optimize_constant_feedback_seq false
 }
 puts "Performing 'syn_generic'"
 syn_generic
 puts "Performing 'syn_map'"
 syn_map
 puts "Performing 'syn_opt'"
 syn_opt
}

proc do_write_netlist { gate_file design_name } {
  write_hdl $design_name > $gate_file
  report_memory
  puts " memory_usage [get_db / .memory_usage]"
  puts " physical_memory_usage [get_db / .physical_memory_usage]"
  puts " peak_physical_memory_usage [get_db / .peak_physical_memory_usage]"
  puts " peak_memory  [get_db / .peak_memory]"
}

