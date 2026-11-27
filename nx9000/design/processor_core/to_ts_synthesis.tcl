#! /bin/sh -f
#\
exec tessent -shell -log $0.log -replace -dofile "$0"
set_context dft -rtl
#please add standard cell verilog file here, please add memory library file here
read_verilog -f processor_core.flist

set_current_design processor_core
add_black_box -auto
set_attribute_value [get_modules -of_type design] -name synthesize_before_analysis
set_design_level physical_block
set_system_mode analysis
if {![file exists TESSENT_RTL_LIB_DIR]} {
    # The following will introspect one of the Tessent RTLC modules and use it to locate a directory location to be used for simulation.
    set rtlcModuleName [get_single_name [index_collection [get_module RTLC*] 0]]
    set tessentRtlcLibDir [file dirname [lindex [get_attribute_value_list $rtlcModuleName -name file_path_name] 0]]
    # Create a link in the current directory that may be used to find *.v files for simulation.
    file link TESSENT_RTL_LIB_DIR $tessentRtlcLibDir
    # Also put a copy of the link at the calling routine level (two levels above synthesis_outdir/${current_design}_${design_id}.synthesis_dc_shell).
    file copy -force TESSENT_RTL_LIB_DIR ../.
}
if {![file exists ../TESSENT_RTL_LIB_DIR]} {
    file link ../TESSENT_RTL_LIB_DIR $tessentRtlcLibDir
}
  write_design -out_file processor_core_synthesized.vg -replace
exit
