module dfx_dro_ctrl_tdr (
  input wire [319:0] dro_count_status_tdr,
  input wire dfx_mode,
  input wire [17:0] dro_ctrl,
  output wire [319:0] dro_count_status,
  output wire [17:0] dro_ctrl_tdr
);

generate
genvar i_dro_count_status;
for(i_dro_count_status=0; i_dro_count_status<320; i_dro_count_status=i_dro_count_status+1) begin: dro_count_status_gen
    cell_and2 dro_count_status_persistent_and2_inst (.Z(dro_count_status[i_dro_count_status]), .A1(dro_count_status_tdr[i_dro_count_status]), .A2(dfx_mode));
end
endgenerate

generate
genvar i_dro_ctrl;
for(i_dro_ctrl=0; i_dro_ctrl<18; i_dro_ctrl=i_dro_ctrl+1) begin: dro_ctrl_gen
    cell_and2 dro_ctrl_persistent_and2_inst (.Z(dro_ctrl_tdr[i_dro_ctrl]), .A1(dro_ctrl[i_dro_ctrl]), .A2(dfx_mode));
end
endgenerate

endmodule
