module top;
`ifdef USE_A
  sub_a u();
`else
  sub_b u();
`endif
endmodule
