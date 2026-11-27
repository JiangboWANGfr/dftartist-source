`define M3_WIRE(NAME, SRC) wire NAME = SRC;
module source_leaf(input wire d, output wire q);
  wire first, second;
  `M3_WIRE(from_macro, d)
  /* 中文 */	assign q = from_macro;
endmodule
