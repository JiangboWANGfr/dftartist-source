module dfx_pvt_ctrl_tdr (
  input wire [119:0] m1_tsen_jtag_ovrd_ijtag_ovrd_tdr,
  input wire  m1_tsen_jtag_ovrd_ijtag_ovrd_en_tdr,
  input wire dfx_mode,
  output wire [119:0] m1_tsen_jtag_ovrd_ijtag_ovrd,
  output wire  m1_tsen_jtag_ovrd_ijtag_ovrd_en
);

generate
genvar i_m1_tsen_jtag_ovrd_ijtag_ovrd;
for(i_m1_tsen_jtag_ovrd_ijtag_ovrd=0; i_m1_tsen_jtag_ovrd_ijtag_ovrd<120; i_m1_tsen_jtag_ovrd_ijtag_ovrd=i_m1_tsen_jtag_ovrd_ijtag_ovrd+1) begin: m1_tsen_jtag_ovrd_ijtag_ovrd_gen
    cell_and2 m1_tsen_jtag_ovrd_ijtag_ovrd_persistent_and2_inst (.Z(m1_tsen_jtag_ovrd_ijtag_ovrd[i_m1_tsen_jtag_ovrd_ijtag_ovrd]), .A1(m1_tsen_jtag_ovrd_ijtag_ovrd_tdr[i_m1_tsen_jtag_ovrd_ijtag_ovrd]), .A2(dfx_mode));
end
endgenerate

cell_and2 m1_tsen_jtag_ovrd_ijtag_ovrd_en_persistent_and2_inst (.Z(m1_tsen_jtag_ovrd_ijtag_ovrd_en), .A1(m1_tsen_jtag_ovrd_ijtag_ovrd_en_tdr), .A2(dfx_mode));
endmodule
