`ifndef B_R3_SOURCE_INCREMENT
`define B_R3_SOURCE_INCREMENT
`define B_R3_INNER(NAME, SRC) wire NAME; assign NAME = SRC;
`define B_R3_OUTER(NAME, SRC) `B_R3_INNER(NAME, SRC)
module r3_leaf(input wire a, input wire b, output wire q);
  wire first, second;
  `B_R3_OUTER(from_macro, a)
  assign q = from_macro;
endmodule
`endif
