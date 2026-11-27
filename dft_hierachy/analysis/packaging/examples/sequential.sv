module example_ff(input logic c, r, d, output logic q);
  always_ff @(posedge c or negedge r) if (!r) q <= 0; else q <= d;
endmodule
module sequential_example(input logic clk, rst, d, output logic q, s);
  example_ff u(clk, rst, d, q);
  always_ff @(posedge clk) s <= d;
endmodule
