tclmode

set work_dirs "
    ./logs
    ./reports
" 
foreach dir $work_dirs {
    if {![file isdirectory $dir]} {
        file mkdir $dir
    }
}

set_screen_display -noprogress
set_dofile_abort exit

### Alias mapping flow is enabled. ###
# Root attribute 'wlec_rtl_name_mapping_flow' was 'false'.
# Root attribute 'alias_flow'    was 'true'.

set lec_version [regsub {(-)[A-Za-z]} $env(LEC_VERSION) ""]

# Turns on the flowgraph datapath solver.
set wlec_analyze_dp_flowgraph true
# Indicates that resource sharing datapath optimization is present.
set share_dp_analysis    false

# The flowgraph solver is recommended for datapath analysis in LEC 19.1 or newer.
set lec_version_required "19.10100"
if {$lec_version >= $lec_version_required &&
    $wlec_analyze_dp_flowgraph} {
    set DATAPATH_SOLVER_OPTION "-flowgraph"
} elseif {$share_dp_analysis} {
    set DATAPATH_SOLVER_OPTION "-share"
} else {
    set DATAPATH_SOLVER_OPTION ""
}

# This function is only valid for a flat compare
proc is_pass {} {
    redirect -variable compare_result {report_verification}
    foreach i [split $compare_result "\\n"] {
        if {[regexp {Compare Results:\\s+PASS} $i]} {
            return true
        }
    }
    return false
}

tcl_set_command_name_echo on

set logfile ./logs/lec_rtl2rtl.log

set_log_file $logfile -replace

usage -auto -elapse

# Root attribute 'wlec_multithread_license_list' can be used to specify a license list
# for multithreaded processing. The default list is used otherwise.
set_parallel_option -threads 1,4 -norelease_license
set_compare_options -threads 1,4

set env(RC_VERSION) "21.11-s126_1"
set env(CDN_SYNTH_R007) "/opt.ext/eda2024/cadence/GENUS211/tools.lnx86"
set CDN_SYNTH_R007 "/opt.ext/eda2024/cadence/GENUS211/tools.lnx86"
set env(CW_DIR) "/opt.ext/eda2024/cadence/GENUS211/tools.lnx86/lib/chipware"
set CW_DIR "/opt.ext/eda2024/cadence/GENUS211/tools.lnx86/lib/chipware"

# default is to error out when module definitions are missing
set_undefined_cell black_box -noascend -both

add_search_path . /opt.ext/eda2024/cadence/GENUS211/tools.lnx86/lib/tech -library -both
read_library -liberty -both {/s4d0/pdk/smic/smic28hkcp/STD/SCC28NHKCPE_HSC35P140_PMK_RVT_V0p1/liberty/1.0v/scc28nhkcpe_hsc35p140_pmk_rvt_tt_v1p0_25c_ccs.lib /s4d0/pdk/smic/smic28hkcp/STD/SCC28NHKCPE_HSC35P140_RVT_V0p1/liberty/1.0v/scc28nhkcpe_hsc35p140_rvt_tt_v1p0_25c_ccs.lib /s4d0/pdk/smic/smic28hkcp/STD/SCC28NHKCP_HDC30P140_ECO_HVT_V0p1/liberty/1.0v/scc28nhkcp_hdc30p140_eco_hvt_tt_v1p0_25c_ccs.lib}

set_x_conversion E -both

set lec_version_required "16.20100"
if {$lec_version >= $lec_version_required} {
    set_naming_style genus -golden
} else {
    set_naming_style rc -golden
}

set_naming_rule "_" -parameter -golden
set_naming_rule "_" "" -array_delimiter -golden
set_naming_rule "%s_%d" -instance_array -golden
set_naming_rule "%s_reg" -register -golden
set_naming_rule "%L_%s" "%L_%d_%s" "%s" -instance -golden
set_naming_rule "%L_%s" "%L_%d_%s" "%s" -variable -golden
set_naming_rule -mdportflatten -golden
set lec_version_required "17.10200"
if {$lec_version >= $lec_version_required} {
    set_naming_rule -ungroup_separator {___} -golden
}

# Align LEC's treatment of mismatched port widths with constant
# connections with Genus's, Genus message CDFG-467 and LEC message
# HRC3.6 may indicate the presence of this issue.
# This option is only available with LEC 17.20-d301 or later.
set lec_version_required "17.20301"
if {$lec_version >= $lec_version_required} {
    set_hdl_options -const_port_extend
}
set_hdl_options -unsigned_conversion_overflow on
# Align LEC's treatment of libext in command files with Genus's.
# Only available with LEC 19.20-d138 or later.
set lec_version_required "19.20138"
if {$lec_version >= $lec_version_required} {
    set_hdl_options -nolibext_def on
}

set lec_version_required "19.20138"
if {$lec_version >= $lec_version_required} {
    set_hdl_options -VERILOG_INCLUDE_DIR "cwd:incdir:src:yyd:sep"
} else {
    set_hdl_options -VERILOG_INCLUDE_DIR "cwd:incdir:src:yd:y:sep"
}
add_search_path . -design -golden
read_design -enumconstraint -define SYNTHESIS -merge bbox -golden -lastmod -noelab -sv09 -f /prj/PnR910/workareas/nanocad/liuqi/LSW_DFT_1221/design/cpu0_sys/cpu0_sys_flat.vc
elaborate_design -golden -root cpu0_sys -rootonly

read_design -enumconstraint -define SYNTHESIS -merge bbox -revised -lastmod -noelab -sv09 -f /prj/PnR910/workareas/nanocad/roger/LSW_DFT_1221/dft_path/cpu0_sys/cpu0_sys.vc_et
elaborate_design -revised -root cpu0_sys -rootonly

report_design_data
report_black_box > ./reports/cpu0_sys.r2r.black_box.rpt

set_flatten_model -seq_constant
set_flatten_model -hier_seq_merge
set_flatten_model -gated_clock
set_flatten_model -latch_transparent

source /prj/PnR910/workareas/nanocad/liuqi/LSW_DFT_1220/user_material/lec_const/cpu0_sys_r2r_const.tcl

# Reports the quality of the implementation information.
# This command is only available with LEC 20.10-p200 or later.
set lec_version_required "20.10100"
if {$lec_version >= $lec_version_required} {
    check_verification_information
}

set_analyze_option -auto -report_map

write_hier_compare_dofile hier_tmp2.lec.do -verbose -noexact_pin_match -constraint -usage \\
-replace -balanced_extraction -input_output_pin_equivalence \\
-prepend_string "report_design_data; report_unmapped_points -summary; report_unmapped_points -notmapped; analyze_datapath -module -verbose; eval analyze_datapath $DATAPATH_SOLVER_OPTION -verbose"
run_hier_compare hier_tmp2.lec.do -dynamic_hierarchy

report_hier_compare_result -dynamicflattened
report_verification -hier -verbose

set_system_mode lec

puts "No of compare points = [get_compare_points -count]"
puts "No of diff points    = [get_compare_points -NONequivalent -count]"
puts "No of abort points = [get_compare_points -abort -count]"
puts "No of unknown points = [get_compare_points -unknown -count]"
if {[get_compare_points -count] == 0} {
    puts "***************************"
    puts "ERROR: No compare points detected"
    puts "***************************"
}
if {[get_compare_points -NONequivalent -count] > 0} {
    puts "***************************"
    puts "ERROR: Different Key Points detected"
    puts "***************************"
}
if {[get_compare_points -abort -count] > 0} {
    puts "ERROR: Abort Points detected"
    puts "***************************"
}
if {[get_compare_points -unknown -count] > 0} {
    puts "~~~~~~~~~~~~~~~~~~~~~~~~~"
    puts "ERROR: Unknown Key Points detected"
    puts "~~~~~~~~~~~~~~~~~~~~~~~~~"
}

report_compare_data -class nonequivalent -class abort -class notcompared
report_statistics

#lec reports
report_design_data > ./reports/cpu0_sys.r2r.design_data.rpt
report_pin_constraints > ./reports/cpu0_sys.r2r.pin_constraints.rpt
report_verification -hier -verbose > ./reports/cpu0_sys.r2r.verfi_result.rpt
report_compare_data -class nonequivalent -verbose > ./reports/cpu0_sys.r2r.noneq_points.rpt

# Generate a detailed summary of the run.
# This command is available with LEC 19.10-p100 or later.
set lec_version_required "19.10100"
if {$lec_version >= $lec_version_required} {
    analyze_results -logfiles $logfile
}

# Check in RTL2RTL compare result
if {![is_pass]} {
    puts "ERROR: Compare was not equivalent"
}

#checkpoint ./fv/lec_rtl2rtl.ckpt -replace
vpxmode
