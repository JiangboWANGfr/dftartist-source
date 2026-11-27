module dfx_pad_cfg_ctrl_tdr (
  input wire  dfx_bist_mode_sel_tdr,
  input wire [9:0] dfx_pad_pd_tdr,
  input wire [9:0] dfx_pad_pu_tdr,
  input wire [9:0] dfx_pad_ds0_tdr,
  input wire [9:0] dfx_pad_ds1_tdr,
  input wire [9:0] dfx_pad_ds2_tdr,
  input wire [9:0] dfx_pad_ds3_tdr,
  input wire [9:0] dfx_pad_st_tdr,
  input wire dfx_mode,
  input wire  dfx_pll_enable,
  input wire [9:0] dfx_pll_ratio,
  output wire  dfx_bist_mode_sel,
  output wire [9:0] dfx_pad_pd,
  output wire [9:0] dfx_pad_pu,
  output wire [9:0] dfx_pad_ds0,
  output wire [9:0] dfx_pad_ds1,
  output wire [9:0] dfx_pad_ds2,
  output wire [9:0] dfx_pad_ds3,
  output wire [9:0] dfx_pad_st,
  output wire  dfx_pll_enable_tdr,
  output wire [9:0] dfx_pll_ratio_tdr
);

cell_and2 dfx_bist_mode_sel_persistent_and2_inst (.Z(dfx_bist_mode_sel), .A1(dfx_bist_mode_sel_tdr), .A2(dfx_mode));
generate
genvar i_dfx_pad_pd;
for(i_dfx_pad_pd=0; i_dfx_pad_pd<10; i_dfx_pad_pd=i_dfx_pad_pd+1) begin: dfx_pad_pd_gen
    cell_and2 dfx_pad_pd_persistent_and2_inst (.Z(dfx_pad_pd[i_dfx_pad_pd]), .A1(dfx_pad_pd_tdr[i_dfx_pad_pd]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_dfx_pad_pu;
for(i_dfx_pad_pu=0; i_dfx_pad_pu<10; i_dfx_pad_pu=i_dfx_pad_pu+1) begin: dfx_pad_pu_gen
    cell_and2 dfx_pad_pu_persistent_and2_inst (.Z(dfx_pad_pu[i_dfx_pad_pu]), .A1(dfx_pad_pu_tdr[i_dfx_pad_pu]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_dfx_pad_ds0;
for(i_dfx_pad_ds0=0; i_dfx_pad_ds0<10; i_dfx_pad_ds0=i_dfx_pad_ds0+1) begin: dfx_pad_ds0_gen
    cell_and2 dfx_pad_ds0_persistent_and2_inst (.Z(dfx_pad_ds0[i_dfx_pad_ds0]), .A1(dfx_pad_ds0_tdr[i_dfx_pad_ds0]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_dfx_pad_ds1;
for(i_dfx_pad_ds1=0; i_dfx_pad_ds1<10; i_dfx_pad_ds1=i_dfx_pad_ds1+1) begin: dfx_pad_ds1_gen
    cell_and2 dfx_pad_ds1_persistent_and2_inst (.Z(dfx_pad_ds1[i_dfx_pad_ds1]), .A1(dfx_pad_ds1_tdr[i_dfx_pad_ds1]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_dfx_pad_ds2;
for(i_dfx_pad_ds2=0; i_dfx_pad_ds2<10; i_dfx_pad_ds2=i_dfx_pad_ds2+1) begin: dfx_pad_ds2_gen
    cell_and2 dfx_pad_ds2_persistent_and2_inst (.Z(dfx_pad_ds2[i_dfx_pad_ds2]), .A1(dfx_pad_ds2_tdr[i_dfx_pad_ds2]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_dfx_pad_ds3;
for(i_dfx_pad_ds3=0; i_dfx_pad_ds3<10; i_dfx_pad_ds3=i_dfx_pad_ds3+1) begin: dfx_pad_ds3_gen
    cell_and2 dfx_pad_ds3_persistent_and2_inst (.Z(dfx_pad_ds3[i_dfx_pad_ds3]), .A1(dfx_pad_ds3_tdr[i_dfx_pad_ds3]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_dfx_pad_st;
for(i_dfx_pad_st=0; i_dfx_pad_st<10; i_dfx_pad_st=i_dfx_pad_st+1) begin: dfx_pad_st_gen
    cell_and2 dfx_pad_st_persistent_and2_inst (.Z(dfx_pad_st[i_dfx_pad_st]), .A1(dfx_pad_st_tdr[i_dfx_pad_st]), .A2(dfx_mode));
end
endgenerate

cell_and2 dfx_pll_enable_persistent_and2_inst (.Z(dfx_pll_enable_tdr), .A1(dfx_pll_enable), .A2(dfx_mode));
generate
genvar i_dfx_pll_ratio;
for(i_dfx_pll_ratio=0; i_dfx_pll_ratio<10; i_dfx_pll_ratio=i_dfx_pll_ratio+1) begin: dfx_pll_ratio_gen
    cell_and2 dfx_pll_ratio_persistent_and2_inst (.Z(dfx_pll_ratio_tdr[i_dfx_pll_ratio]), .A1(dfx_pll_ratio[i_dfx_pll_ratio]), .A2(dfx_mode));
end
endgenerate

endmodule
