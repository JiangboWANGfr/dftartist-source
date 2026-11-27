`define SOURCE_WINDOW_DECLS wire left = a; wire right = a;
module source_leaf(input wire a, output wire y);
  `SOURCE_WINDOW_DECLS
  assign y = left & right;
endmodule
