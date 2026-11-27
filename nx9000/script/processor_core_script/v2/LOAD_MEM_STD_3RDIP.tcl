########################################
# Tessent Library Setup Script
# Generated from: /home/wongw/nx9000/dft_studio_db/processor_core/compiled/version/dft_setting.yaml
# Date: Sun Jul 19 09:02:46 2026
########################################

##### algo_opset #####
read_core_description /home/wongw/nx9000/user_material/algo/*.algo
read_core_description /home/wongw/nx9000/user_material/opset/*.text


##### membistlib #####
set_design_sources -format tcd_memory -y  /home/wongw/nx9000/library/memories -extension {tcd_memory lvmemlib lvlib}


##### memverilog #####
read_verilog /home/wongw/nx9000/library/memories/*.v -interface_only -exclude_from_file_dictionary


##### pad #####
#read_cell_library /home/redhat/ywang/tessent_example_automotive_reference_flow_v2025.1/library/NangateOpenCellLibrary_PDKv1_3_v2010_12/Front_End/DFT/*.tcelllib
# read_verilog /home/redhat/ywang/tessent_example_automotive_reference_flow_v2025.1/library/NangateOpenCellLibrary_PDKv1_3_v2010_12/Front_End/DFT/*.v
# read_verilog /home/redhat/ywang/tessent_example_automotive_reference_flow_v2025.1/library/NangateOpenCellLibrary_PDKv1_3_v2010_12/Front_End/DFT/*.sv


##### standard_cell #####
read_cell_library /home/wongw/nx9000/library/standard_cells/tessent/adk.tcelllib
set_design_sources -format verilog -y /home/wongw/nx9000/library/standard_cells/verilog/ -extension {v}


##### tcd_bscan #####
#add later


##### tcd_scan #####
#add later


