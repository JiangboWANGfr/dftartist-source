module dfx_mem_ema_ctrl (
  input wire  ema_tdr_ovrd_en_tdr,
  input wire [191:0] ema_tdr_ovrd_tdr,
  input wire dfx_mode,
  output wire  ema_tdr_ovrd_en,
  output wire [191:0] ema_tdr_ovrd
);

cell_and2 ema_tdr_ovrd_en_persistent_and2_inst (.Z(ema_tdr_ovrd_en), .A1(ema_tdr_ovrd_en_tdr), .A2(dfx_mode));
generate
genvar i_ema_tdr_ovrd;
for(i_ema_tdr_ovrd=0; i_ema_tdr_ovrd<192; i_ema_tdr_ovrd=i_ema_tdr_ovrd+1) begin: ema_tdr_ovrd_gen
    cell_and2 ema_tdr_ovrd_persistent_and2_inst (.Z(ema_tdr_ovrd[i_ema_tdr_ovrd]), .A1(ema_tdr_ovrd_tdr[i_ema_tdr_ovrd]), .A2(dfx_mode));
end
endgenerate

endmodule

