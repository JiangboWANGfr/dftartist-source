module pll_ctrl_ds1 (
  input wire  enable_tdr,
  input wire dfx_mode,
  input wire  LOCKED,
  output wire  enable,
  output wire  LOCKED_tdr
);

cell_and2 enable_persistent_and2_inst (.Z(enable), .A1(enable_tdr), .A2(dfx_mode));
cell_and2 LOCKED_persistent_and2_inst (.Z(LOCKED_tdr), .A1(LOCKED), .A2(dfx_mode));
endmodule

