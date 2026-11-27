module dfx_trug_ctrl_tdr (
  input wire  o_DTRNG_BIST_ERROR_tdr,
  input wire  o_DTRNG_BIST_DONE_tdr,
  input wire  o_FAULT_LAD_DETECT_QF_tdr,
  input wire  o_FAULT_LAD_DETECT_QL_tdr,
  input wire dfx_mode,
  input wire  i_DTRNG_BIST_MODE,
  input wire  i_DTRNG_BIST_RSTN,
  input wire [15:0] i_DTRNG_BIST_SEL,
  input wire [3:0] i_DTRNG_BIST_TEST_SIZE,
  input wire [15:0] i_DTRNG_BIST_ACT_CUTOFF,
  input wire [15:0] i_DTRNG_BIST_MB_CUTOFF,
  input wire  i_DTRNG_BIST_SBIST_EN,
  input wire  i_DTRNG_BIST_LAD_RESET,
  output wire  o_DTRNG_BIST_ERROR,
  output wire  o_DTRNG_BIST_DONE,
  output wire  o_FAULT_LAD_DETECT_QF,
  output wire  o_FAULT_LAD_DETECT_QL,
  output wire  i_DTRNG_BIST_MODE_tdr,
  output wire  i_DTRNG_BIST_RSTN_tdr,
  output wire [15:0] i_DTRNG_BIST_SEL_tdr,
  output wire [3:0] i_DTRNG_BIST_TEST_SIZE_tdr,
  output wire [15:0] i_DTRNG_BIST_ACT_CUTOFF_tdr,
  output wire [15:0] i_DTRNG_BIST_MB_CUTOFF_tdr,
  output wire  i_DTRNG_BIST_SBIST_EN_tdr,
  output wire  i_DTRNG_BIST_LAD_RESET_tdr
);

cell_and2 o_DTRNG_BIST_ERROR_persistent_and2_inst (.Z(o_DTRNG_BIST_ERROR), .A1(o_DTRNG_BIST_ERROR_tdr), .A2(dfx_mode));
cell_and2 o_DTRNG_BIST_DONE_persistent_and2_inst (.Z(o_DTRNG_BIST_DONE), .A1(o_DTRNG_BIST_DONE_tdr), .A2(dfx_mode));
cell_and2 o_FAULT_LAD_DETECT_QF_persistent_and2_inst (.Z(o_FAULT_LAD_DETECT_QF), .A1(o_FAULT_LAD_DETECT_QF_tdr), .A2(dfx_mode));
cell_and2 o_FAULT_LAD_DETECT_QL_persistent_and2_inst (.Z(o_FAULT_LAD_DETECT_QL), .A1(o_FAULT_LAD_DETECT_QL_tdr), .A2(dfx_mode));
cell_and2 i_DTRNG_BIST_MODE_persistent_and2_inst (.Z(i_DTRNG_BIST_MODE_tdr), .A1(i_DTRNG_BIST_MODE), .A2(dfx_mode));
cell_and2 i_DTRNG_BIST_RSTN_persistent_and2_inst (.Z(i_DTRNG_BIST_RSTN_tdr), .A1(i_DTRNG_BIST_RSTN), .A2(dfx_mode));
generate
genvar i_i_DTRNG_BIST_SEL;
for(i_i_DTRNG_BIST_SEL=0; i_i_DTRNG_BIST_SEL<16; i_i_DTRNG_BIST_SEL=i_i_DTRNG_BIST_SEL+1) begin: i_DTRNG_BIST_SEL_gen
    cell_and2 i_DTRNG_BIST_SEL_persistent_and2_inst (.Z(i_DTRNG_BIST_SEL_tdr[i_i_DTRNG_BIST_SEL]), .A1(i_DTRNG_BIST_SEL[i_i_DTRNG_BIST_SEL]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_i_DTRNG_BIST_TEST_SIZE;
for(i_i_DTRNG_BIST_TEST_SIZE=0; i_i_DTRNG_BIST_TEST_SIZE<4; i_i_DTRNG_BIST_TEST_SIZE=i_i_DTRNG_BIST_TEST_SIZE+1) begin: i_DTRNG_BIST_TEST_SIZE_gen
    cell_and2 i_DTRNG_BIST_TEST_SIZE_persistent_and2_inst (.Z(i_DTRNG_BIST_TEST_SIZE_tdr[i_i_DTRNG_BIST_TEST_SIZE]), .A1(i_DTRNG_BIST_TEST_SIZE[i_i_DTRNG_BIST_TEST_SIZE]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_i_DTRNG_BIST_ACT_CUTOFF;
for(i_i_DTRNG_BIST_ACT_CUTOFF=0; i_i_DTRNG_BIST_ACT_CUTOFF<16; i_i_DTRNG_BIST_ACT_CUTOFF=i_i_DTRNG_BIST_ACT_CUTOFF+1) begin: i_DTRNG_BIST_ACT_CUTOFF_gen
    cell_and2 i_DTRNG_BIST_ACT_CUTOFF_persistent_and2_inst (.Z(i_DTRNG_BIST_ACT_CUTOFF_tdr[i_i_DTRNG_BIST_ACT_CUTOFF]), .A1(i_DTRNG_BIST_ACT_CUTOFF[i_i_DTRNG_BIST_ACT_CUTOFF]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_i_DTRNG_BIST_MB_CUTOFF;
for(i_i_DTRNG_BIST_MB_CUTOFF=0; i_i_DTRNG_BIST_MB_CUTOFF<16; i_i_DTRNG_BIST_MB_CUTOFF=i_i_DTRNG_BIST_MB_CUTOFF+1) begin: i_DTRNG_BIST_MB_CUTOFF_gen
    cell_and2 i_DTRNG_BIST_MB_CUTOFF_persistent_and2_inst (.Z(i_DTRNG_BIST_MB_CUTOFF_tdr[i_i_DTRNG_BIST_MB_CUTOFF]), .A1(i_DTRNG_BIST_MB_CUTOFF[i_i_DTRNG_BIST_MB_CUTOFF]), .A2(dfx_mode));
end
endgenerate

cell_and2 i_DTRNG_BIST_SBIST_EN_persistent_and2_inst (.Z(i_DTRNG_BIST_SBIST_EN_tdr), .A1(i_DTRNG_BIST_SBIST_EN), .A2(dfx_mode));
cell_and2 i_DTRNG_BIST_LAD_RESET_persistent_and2_inst (.Z(i_DTRNG_BIST_LAD_RESET_tdr), .A1(i_DTRNG_BIST_LAD_RESET), .A2(dfx_mode));
endmodule
