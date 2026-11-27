module timing_small(input CLK, input [2:0] A, input [7:0] D, output [7:0] Q);
 assign Q=D;
endmodule
module timing_large(input CLK, input [31:0] A, input [7:0] D, output [7:0] Q);
 assign Q=D;
endmodule
module timing_top(input clk, input [31:0] a, input [7:0] d, output [15:0] q);
 timing_small u_small(clk,a[2:0],d,q[7:0]);
 timing_large big(clk,a,d,q[15:8]);
endmodule
