module fbi_instance_ctrl (
  input wire  read_buffer_tdr,
  input wire dfx_mode,
  input wire  donFB,
  output wire  read_buffer,
  output wire  donFB_tdr
);

cell_and2 read_buffer_persistent_and2_inst (.Z(read_buffer), .A1(read_buffer_tdr), .A2(dfx_mode));
cell_and2 donFB_persistent_and2_inst (.Z(donFB_tdr), .A1(donFB), .A2(dfx_mode));
endmodule

