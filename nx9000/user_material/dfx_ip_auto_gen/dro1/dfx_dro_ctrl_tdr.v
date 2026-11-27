module dfx_dro_ctrl_tdr (
  input wire [19:0] dro_ijtag_ctrl_tdr,
  input wire  dro_ijtag_ctrl_en_tdr,
  input wire dfx_mode,
  input wire [192:0] dro_counter_status,
  output wire [19:0] dro_ijtag_ctrl,
  output wire  dro_ijtag_ctrl_en,
  output wire [192:0] dro_counter_status_tdr
);

generate
genvar i_dro_ijtag_ctrl;
for(i_dro_ijtag_ctrl=0; i_dro_ijtag_ctrl<20; i_dro_ijtag_ctrl=i_dro_ijtag_ctrl+1) begin: dro_ijtag_ctrl_gen
    cell_and2 dro_ijtag_ctrl_persistent_and2_inst (.Z(dro_ijtag_ctrl[i_dro_ijtag_ctrl]), .A1(dro_ijtag_ctrl_tdr[i_dro_ijtag_ctrl]), .A2(dfx_mode));
end
endgenerate

cell_and2 dro_ijtag_ctrl_en_persistent_and2_inst (.Z(dro_ijtag_ctrl_en), .A1(dro_ijtag_ctrl_en_tdr), .A2(dfx_mode));
generate
genvar i_dro_counter_status;
for(i_dro_counter_status=0; i_dro_counter_status<193; i_dro_counter_status=i_dro_counter_status+1) begin: dro_counter_status_gen
    cell_and2 dro_counter_status_persistent_and2_inst (.Z(dro_counter_status_tdr[i_dro_counter_status]), .A1(dro_counter_status[i_dro_counter_status]), .A2(dfx_mode));
end
endgenerate

endmodule
