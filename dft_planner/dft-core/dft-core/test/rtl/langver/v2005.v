// `always_ff` and `logic` are SystemVerilog keywords: fine in 1800-*, plain identifiers (and so a
// syntax error here) under 1364-2005.
module ff(input logic clk, input logic d, output logic q);
  always_ff @(posedge clk) q <= d;
endmodule
