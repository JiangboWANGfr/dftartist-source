##
##  The attributes have now been added to the 
##  library and the Tessent Library is now
##  written out.
##
set_cell_library_options -augment_dft_cell_selection off
read_liberty ../liberty/adk.lib
read_cell_library libcomp.atpglib cell.map
read_cell_library dft_cell_selection
write_cell_library ../tessent/adk.tcelllib -replace -include_created_dft_cell_selection
##
exit -d
