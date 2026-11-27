########################################
# Tessent Library Setup Script
# Generated from: /home/wongw/nx9000/dft_studio_db/processor_core/compiled/version/dft_setting.yaml
# Date: Thu Aug 20 22:28:17 2026
########################################

##### fscan #####
read_cell_library /home/wongw/nx9000/library/memories/SYNC_1RW_8Kx16.atpglib

##### memverilog #####
read_verilog /home/wongw/nx9000/library/memories/*.v -interface_only -exclude_from_file_dictionary


##### pad #####
#read_cell_library /home/redhat/ywang/tessent_example_automotive_reference_flow_v2025.1/library/NangateOpenCellLibrary_PDKv1_3_v2010_12/Front_End/DFT/*.tcelllib
# read_verilog /home/redhat/ywang/tessent_example_automotive_reference_flow_v2025.1/library/NangateOpenCellLibrary_PDKv1_3_v2010_12/Front_End/DFT/*.v
# read_verilog /home/redhat/ywang/tessent_example_automotive_reference_flow_v2025.1/library/NangateOpenCellLibrary_PDKv1_3_v2010_12/Front_End/DFT/*.sv


##### standard_cell #####
read_cell_library /home/wongw/nx9000/library/standard_cells/tessent/adk.tcelllib
set_design_sources -format verilog -y /home/wongw/nx9000/library/standard_cells/verilog/ -extension {v}
read_cell_library /home/wongw/nx9000/dft_path/processor_core/v1/TESSENT_RTL_LIB_DIR/dft_sim.atpg
read_verilog /home/wongw/nx9000/dft_path/processor_core/v1/TESSENT_RTL_LIB_DIR/dft_sim.v


##### tcd_scan #####
#add later


