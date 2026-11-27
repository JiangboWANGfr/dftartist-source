module dfx_clk_aux_monitor_ctrl_tdr (
  input wire  dfx_clock_aux_rst_n_tdr,
  input wire [7:0] dfx_clock_aux_div_ratio_tdr,
  input wire [5:0] dfx_clock_aux_clk_sel_tdr,
  input wire  dfx_clock_aux_pad_en_tdr,
  input wire [63:0] dfx_clock_aux_clk_en_tdr,
  input wire dfx_mode,
  output wire  dfx_clock_aux_rst_n,
  output wire [7:0] dfx_clock_aux_div_ratio,
  output wire [5:0] dfx_clock_aux_clk_sel,
  output wire  dfx_clock_aux_pad_en,
  output wire [63:0] dfx_clock_aux_clk_en
);

cell_and2 dfx_clock_aux_rst_n_persistent_and2_inst (.Z(dfx_clock_aux_rst_n), .A1(dfx_clock_aux_rst_n_tdr), .A2(dfx_mode));
generate
genvar i_dfx_clock_aux_div_ratio;
for(i_dfx_clock_aux_div_ratio=0; i_dfx_clock_aux_div_ratio<8; i_dfx_clock_aux_div_ratio=i_dfx_clock_aux_div_ratio+1) begin: dfx_clock_aux_div_ratio_gen
    cell_and2 dfx_clock_aux_div_ratio_persistent_and2_inst (.Z(dfx_clock_aux_div_ratio[i_dfx_clock_aux_div_ratio]), .A1(dfx_clock_aux_div_ratio_tdr[i_dfx_clock_aux_div_ratio]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_dfx_clock_aux_clk_sel;
for(i_dfx_clock_aux_clk_sel=0; i_dfx_clock_aux_clk_sel<6; i_dfx_clock_aux_clk_sel=i_dfx_clock_aux_clk_sel+1) begin: dfx_clock_aux_clk_sel_gen
    cell_and2 dfx_clock_aux_clk_sel_persistent_and2_inst (.Z(dfx_clock_aux_clk_sel[i_dfx_clock_aux_clk_sel]), .A1(dfx_clock_aux_clk_sel_tdr[i_dfx_clock_aux_clk_sel]), .A2(dfx_mode));
end
endgenerate

cell_and2 dfx_clock_aux_pad_en_persistent_and2_inst (.Z(dfx_clock_aux_pad_en), .A1(dfx_clock_aux_pad_en_tdr), .A2(dfx_mode));
generate
genvar i_dfx_clock_aux_clk_en;
for(i_dfx_clock_aux_clk_en=0; i_dfx_clock_aux_clk_en<64; i_dfx_clock_aux_clk_en=i_dfx_clock_aux_clk_en+1) begin: dfx_clock_aux_clk_en_gen
    cell_and2 dfx_clock_aux_clk_en_persistent_and2_inst (.Z(dfx_clock_aux_clk_en[i_dfx_clock_aux_clk_en]), .A1(dfx_clock_aux_clk_en_tdr[i_dfx_clock_aux_clk_en]), .A2(dfx_mode));
end
endgenerate

endmodule
