module dfx_pvt_ctrl_tdr (
  input wire  HTOL_SEL_tdr,
  input wire [1:0] AMUX_ADDR_TS_tdr,
  input wire [1:0] AVG_MODE_TS_tdr,
  input wire [1:0] BGR_I_CON_TS_tdr,
  input wire [1:0] BGR_TC_CON_TS_tdr,
  input wire [3:0] BJT_SEL_TS_tdr,
  input wire [1:0] DMUX_ADDR_TS_tdr,
  input wire  EN_TS_tdr,
  input wire [3:0] OFFSET_CON_TS_tdr,
  input wire [6:0] SLOPE_CON_TS_tdr,
  input wire  SOC_TS_tdr,
  input wire  TEST_MODE_TS_tdr,
  input wire  I_EN_CYCLE_tdr,
  input wire [2:0] EN_PS_tdr,
  input wire  SOC_PS_tdr,
  input wire [3:0] SEL_TS_tdr,
  input wire  VOL_RANGE_TS_tdr,
  input wire [6:0] SLOPE_CONT_VS_tdr,
  input wire  I_HFDIV_PS_tdr,
  input wire [5:0] I_PS_SEL_tdr,
  input wire dfx_mode,
  input wire [11:0] OUT_12BIT_TS,
  input wire  EOC_TS,
  input wire  OUT_12BIT_PS,
  input wire  EOC_PS,
  output wire  HTOL_SEL,
  output wire [1:0] AMUX_ADDR_TS,
  output wire [1:0] AVG_MODE_TS,
  output wire [1:0] BGR_I_CON_TS,
  output wire [1:0] BGR_TC_CON_TS,
  output wire [3:0] BJT_SEL_TS,
  output wire [1:0] DMUX_ADDR_TS,
  output wire  EN_TS,
  output wire [3:0] OFFSET_CON_TS,
  output wire [6:0] SLOPE_CON_TS,
  output wire  SOC_TS,
  output wire  TEST_MODE_TS,
  output wire  I_EN_CYCLE,
  output wire [2:0] EN_PS,
  output wire  SOC_PS,
  output wire [3:0] SEL_TS,
  output wire  VOL_RANGE_TS,
  output wire [6:0] SLOPE_CONT_VS,
  output wire  I_HFDIV_PS,
  output wire [5:0] I_PS_SEL,
  output wire [11:0] OUT_12BIT_TS_tdr,
  output wire  EOC_TS_tdr,
  output wire  OUT_12BIT_PS_tdr,
  output wire  EOC_PS_tdr
);

cell_and2 HTOL_SEL_persistent_and2_inst (.Z(HTOL_SEL), .A1(HTOL_SEL_tdr), .A2(dfx_mode));
generate
genvar i_AMUX_ADDR_TS;
for(i_AMUX_ADDR_TS=0; i_AMUX_ADDR_TS<2; i_AMUX_ADDR_TS=i_AMUX_ADDR_TS+1) begin: AMUX_ADDR_TS_gen
    cell_and2 AMUX_ADDR_TS_persistent_and2_inst (.Z(AMUX_ADDR_TS[i_AMUX_ADDR_TS]), .A1(AMUX_ADDR_TS_tdr[i_AMUX_ADDR_TS]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_AVG_MODE_TS;
for(i_AVG_MODE_TS=0; i_AVG_MODE_TS<2; i_AVG_MODE_TS=i_AVG_MODE_TS+1) begin: AVG_MODE_TS_gen
    cell_and2 AVG_MODE_TS_persistent_and2_inst (.Z(AVG_MODE_TS[i_AVG_MODE_TS]), .A1(AVG_MODE_TS_tdr[i_AVG_MODE_TS]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_BGR_I_CON_TS;
for(i_BGR_I_CON_TS=0; i_BGR_I_CON_TS<2; i_BGR_I_CON_TS=i_BGR_I_CON_TS+1) begin: BGR_I_CON_TS_gen
    cell_and2 BGR_I_CON_TS_persistent_and2_inst (.Z(BGR_I_CON_TS[i_BGR_I_CON_TS]), .A1(BGR_I_CON_TS_tdr[i_BGR_I_CON_TS]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_BGR_TC_CON_TS;
for(i_BGR_TC_CON_TS=0; i_BGR_TC_CON_TS<2; i_BGR_TC_CON_TS=i_BGR_TC_CON_TS+1) begin: BGR_TC_CON_TS_gen
    cell_and2 BGR_TC_CON_TS_persistent_and2_inst (.Z(BGR_TC_CON_TS[i_BGR_TC_CON_TS]), .A1(BGR_TC_CON_TS_tdr[i_BGR_TC_CON_TS]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_BJT_SEL_TS;
for(i_BJT_SEL_TS=0; i_BJT_SEL_TS<4; i_BJT_SEL_TS=i_BJT_SEL_TS+1) begin: BJT_SEL_TS_gen
    cell_and2 BJT_SEL_TS_persistent_and2_inst (.Z(BJT_SEL_TS[i_BJT_SEL_TS]), .A1(BJT_SEL_TS_tdr[i_BJT_SEL_TS]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_DMUX_ADDR_TS;
for(i_DMUX_ADDR_TS=0; i_DMUX_ADDR_TS<2; i_DMUX_ADDR_TS=i_DMUX_ADDR_TS+1) begin: DMUX_ADDR_TS_gen
    cell_and2 DMUX_ADDR_TS_persistent_and2_inst (.Z(DMUX_ADDR_TS[i_DMUX_ADDR_TS]), .A1(DMUX_ADDR_TS_tdr[i_DMUX_ADDR_TS]), .A2(dfx_mode));
end
endgenerate

cell_and2 EN_TS_persistent_and2_inst (.Z(EN_TS), .A1(EN_TS_tdr), .A2(dfx_mode));
generate
genvar i_OFFSET_CON_TS;
for(i_OFFSET_CON_TS=0; i_OFFSET_CON_TS<4; i_OFFSET_CON_TS=i_OFFSET_CON_TS+1) begin: OFFSET_CON_TS_gen
    cell_and2 OFFSET_CON_TS_persistent_and2_inst (.Z(OFFSET_CON_TS[i_OFFSET_CON_TS]), .A1(OFFSET_CON_TS_tdr[i_OFFSET_CON_TS]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_SLOPE_CON_TS;
for(i_SLOPE_CON_TS=0; i_SLOPE_CON_TS<7; i_SLOPE_CON_TS=i_SLOPE_CON_TS+1) begin: SLOPE_CON_TS_gen
    cell_and2 SLOPE_CON_TS_persistent_and2_inst (.Z(SLOPE_CON_TS[i_SLOPE_CON_TS]), .A1(SLOPE_CON_TS_tdr[i_SLOPE_CON_TS]), .A2(dfx_mode));
end
endgenerate

cell_and2 SOC_TS_persistent_and2_inst (.Z(SOC_TS), .A1(SOC_TS_tdr), .A2(dfx_mode));
cell_and2 TEST_MODE_TS_persistent_and2_inst (.Z(TEST_MODE_TS), .A1(TEST_MODE_TS_tdr), .A2(dfx_mode));
cell_and2 I_EN_CYCLE_persistent_and2_inst (.Z(I_EN_CYCLE), .A1(I_EN_CYCLE_tdr), .A2(dfx_mode));
generate
genvar i_EN_PS;
for(i_EN_PS=0; i_EN_PS<3; i_EN_PS=i_EN_PS+1) begin: EN_PS_gen
    cell_and2 EN_PS_persistent_and2_inst (.Z(EN_PS[i_EN_PS]), .A1(EN_PS_tdr[i_EN_PS]), .A2(dfx_mode));
end
endgenerate

cell_and2 SOC_PS_persistent_and2_inst (.Z(SOC_PS), .A1(SOC_PS_tdr), .A2(dfx_mode));
generate
genvar i_SEL_TS;
for(i_SEL_TS=0; i_SEL_TS<4; i_SEL_TS=i_SEL_TS+1) begin: SEL_TS_gen
    cell_and2 SEL_TS_persistent_and2_inst (.Z(SEL_TS[i_SEL_TS]), .A1(SEL_TS_tdr[i_SEL_TS]), .A2(dfx_mode));
end
endgenerate

cell_and2 VOL_RANGE_TS_persistent_and2_inst (.Z(VOL_RANGE_TS), .A1(VOL_RANGE_TS_tdr), .A2(dfx_mode));
generate
genvar i_SLOPE_CONT_VS;
for(i_SLOPE_CONT_VS=0; i_SLOPE_CONT_VS<7; i_SLOPE_CONT_VS=i_SLOPE_CONT_VS+1) begin: SLOPE_CONT_VS_gen
    cell_and2 SLOPE_CONT_VS_persistent_and2_inst (.Z(SLOPE_CONT_VS[i_SLOPE_CONT_VS]), .A1(SLOPE_CONT_VS_tdr[i_SLOPE_CONT_VS]), .A2(dfx_mode));
end
endgenerate

cell_and2 I_HFDIV_PS_persistent_and2_inst (.Z(I_HFDIV_PS), .A1(I_HFDIV_PS_tdr), .A2(dfx_mode));
generate
genvar i_I_PS_SEL;
for(i_I_PS_SEL=0; i_I_PS_SEL<6; i_I_PS_SEL=i_I_PS_SEL+1) begin: I_PS_SEL_gen
    cell_and2 I_PS_SEL_persistent_and2_inst (.Z(I_PS_SEL[i_I_PS_SEL]), .A1(I_PS_SEL_tdr[i_I_PS_SEL]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_OUT_12BIT_TS;
for(i_OUT_12BIT_TS=0; i_OUT_12BIT_TS<12; i_OUT_12BIT_TS=i_OUT_12BIT_TS+1) begin: OUT_12BIT_TS_gen
    cell_and2 OUT_12BIT_TS_persistent_and2_inst (.Z(OUT_12BIT_TS_tdr[i_OUT_12BIT_TS]), .A1(OUT_12BIT_TS[i_OUT_12BIT_TS]), .A2(dfx_mode));
end
endgenerate

cell_and2 EOC_TS_persistent_and2_inst (.Z(EOC_TS_tdr), .A1(EOC_TS), .A2(dfx_mode));
cell_and2 OUT_12BIT_PS_persistent_and2_inst (.Z(OUT_12BIT_PS_tdr), .A1(OUT_12BIT_PS), .A2(dfx_mode));
cell_and2 EOC_PS_persistent_and2_inst (.Z(EOC_PS_tdr), .A1(EOC_PS), .A2(dfx_mode));
endmodule
