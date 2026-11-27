module dfx_trug_ctrl_tdr (
  input wire  i_DTRNG_BIST_MODE_tdr,
  input wire  i_DTRNG_BIST_RSTN_tdr,
  input wire [15:0] i_DTRNG_BIST_SEL_tdr,
  input wire [3:0] i_DTRNG_BIST_TEST_SIZE_tdr,
  input wire [15:0] i_DTRNG_BIST_ACT_CUTOFF_tdr,
  input wire [15:0] i_DTRNG_BIST_MB_CUTOFF_tdr,
  input wire  i_DTRNG_BIST_SBIST_EN_tdr,
  input wire  i_DTRNG_BIST_LAD_RESET_tdr,
  input wire  i_STMODE_tdr,
  input wire dfx_mode,
  input wire  o_DTRNG_BIST_ERROR,
  input wire  o_DTRNG_BIST_DONE,
  input wire  o_FAULT_LAD_DETECT_QF,
  input wire  o_FAULT_LAD_DETECT_QL,
  output wire  i_DTRNG_BIST_MODE,
  output wire  i_DTRNG_BIST_RSTN,
  output wire [15:0] i_DTRNG_BIST_SEL,
  output wire [3:0] i_DTRNG_BIST_TEST_SIZE,
  output wire [15:0] i_DTRNG_BIST_ACT_CUTOFF,
  output wire [15:0] i_DTRNG_BIST_MB_CUTOFF,
  output wire  i_DTRNG_BIST_SBIST_EN,
  output wire  i_DTRNG_BIST_LAD_RESET,
  output wire  i_STMODE,
  output wire  o_DTRNG_BIST_ERROR_tdr,
  output wire  o_DTRNG_BIST_DONE_tdr,
  output wire  o_FAULT_LAD_DETECT_QF_tdr,
  output wire  o_FAULT_LAD_DETECT_QL_tdr
);

cell_and2 i_DTRNG_BIST_MODE_persistent_and2_inst (.Z(i_DTRNG_BIST_MODE), .A1(i_DTRNG_BIST_MODE_tdr), .A2(dfx_mode));
cell_and2 i_DTRNG_BIST_RSTN_persistent_and2_inst (.Z(i_DTRNG_BIST_RSTN), .A1(i_DTRNG_BIST_RSTN_tdr), .A2(dfx_mode));
generate
genvar i_i_DTRNG_BIST_SEL;
for(i_i_DTRNG_BIST_SEL=0; i_i_DTRNG_BIST_SEL<16; i_i_DTRNG_BIST_SEL=i_i_DTRNG_BIST_SEL+1) begin: i_DTRNG_BIST_SEL_gen
    cell_and2 i_DTRNG_BIST_SEL_persistent_and2_inst (.Z(i_DTRNG_BIST_SEL[i_i_DTRNG_BIST_SEL]), .A1(i_DTRNG_BIST_SEL_tdr[i_i_DTRNG_BIST_SEL]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_i_DTRNG_BIST_TEST_SIZE;
for(i_i_DTRNG_BIST_TEST_SIZE=0; i_i_DTRNG_BIST_TEST_SIZE<4; i_i_DTRNG_BIST_TEST_SIZE=i_i_DTRNG_BIST_TEST_SIZE+1) begin: i_DTRNG_BIST_TEST_SIZE_gen
    cell_and2 i_DTRNG_BIST_TEST_SIZE_persistent_and2_inst (.Z(i_DTRNG_BIST_TEST_SIZE[i_i_DTRNG_BIST_TEST_SIZE]), .A1(i_DTRNG_BIST_TEST_SIZE_tdr[i_i_DTRNG_BIST_TEST_SIZE]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_i_DTRNG_BIST_ACT_CUTOFF;
for(i_i_DTRNG_BIST_ACT_CUTOFF=0; i_i_DTRNG_BIST_ACT_CUTOFF<16; i_i_DTRNG_BIST_ACT_CUTOFF=i_i_DTRNG_BIST_ACT_CUTOFF+1) begin: i_DTRNG_BIST_ACT_CUTOFF_gen
    cell_and2 i_DTRNG_BIST_ACT_CUTOFF_persistent_and2_inst (.Z(i_DTRNG_BIST_ACT_CUTOFF[i_i_DTRNG_BIST_ACT_CUTOFF]), .A1(i_DTRNG_BIST_ACT_CUTOFF_tdr[i_i_DTRNG_BIST_ACT_CUTOFF]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_i_DTRNG_BIST_MB_CUTOFF;
for(i_i_DTRNG_BIST_MB_CUTOFF=0; i_i_DTRNG_BIST_MB_CUTOFF<16; i_i_DTRNG_BIST_MB_CUTOFF=i_i_DTRNG_BIST_MB_CUTOFF+1) begin: i_DTRNG_BIST_MB_CUTOFF_gen
    cell_and2 i_DTRNG_BIST_MB_CUTOFF_persistent_and2_inst (.Z(i_DTRNG_BIST_MB_CUTOFF[i_i_DTRNG_BIST_MB_CUTOFF]), .A1(i_DTRNG_BIST_MB_CUTOFF_tdr[i_i_DTRNG_BIST_MB_CUTOFF]), .A2(dfx_mode));
end
endgenerate

cell_and2 i_DTRNG_BIST_SBIST_EN_persistent_and2_inst (.Z(i_DTRNG_BIST_SBIST_EN), .A1(i_DTRNG_BIST_SBIST_EN_tdr), .A2(dfx_mode));
cell_and2 i_DTRNG_BIST_LAD_RESET_persistent_and2_inst (.Z(i_DTRNG_BIST_LAD_RESET), .A1(i_DTRNG_BIST_LAD_RESET_tdr), .A2(dfx_mode));
cell_and2 i_STMODE_persistent_and2_inst (.Z(i_STMODE), .A1(i_STMODE_tdr), .A2(dfx_mode));
cell_and2 o_DTRNG_BIST_ERROR_persistent_and2_inst (.Z(o_DTRNG_BIST_ERROR_tdr), .A1(o_DTRNG_BIST_ERROR), .A2(dfx_mode));
cell_and2 o_DTRNG_BIST_DONE_persistent_and2_inst (.Z(o_DTRNG_BIST_DONE_tdr), .A1(o_DTRNG_BIST_DONE), .A2(dfx_mode));
cell_and2 o_FAULT_LAD_DETECT_QF_persistent_and2_inst (.Z(o_FAULT_LAD_DETECT_QF_tdr), .A1(o_FAULT_LAD_DETECT_QF), .A2(dfx_mode));
cell_and2 o_FAULT_LAD_DETECT_QL_persistent_and2_inst (.Z(o_FAULT_LAD_DETECT_QL_tdr), .A1(o_FAULT_LAD_DETECT_QL), .A2(dfx_mode));
endmodule
