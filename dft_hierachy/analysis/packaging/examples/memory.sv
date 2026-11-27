module example_ram(input CLK, input [2:0] A, input [7:0] D, output [7:0] Q);
  assign Q = D;
endmodule
module memory_example(input clk, input [2:0] a, input [7:0] d, output [15:0] q);
  example_ram m0(clk, a, d, q[7:0]);
  example_ram m1(clk, a, d, q[15:8]);
endmodule
