// A `checker` instance is not an InstanceSymbol. It used to be dropped from the hierarchy
// entirely, so `top` looked like it contained only u_sub.
checker no_x_on_d(logic clk, logic d);
  a_no_x: assert property (@(posedge clk) !$isunknown(d));
endchecker

module sub(input logic clk, input logic d, output logic q);
  always_ff @(posedge clk) q <= d;
endmodule

module top(input logic clk, input logic d, output logic q);
  sub u_sub(.clk(clk), .d(d), .q(q));
  no_x_on_d u_chk(clk, d);
endmodule
