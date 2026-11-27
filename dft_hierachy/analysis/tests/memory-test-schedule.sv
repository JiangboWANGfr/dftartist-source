module schedule_ram(input CLK, input [2:0] A, input [7:0] D, output [7:0] Q);
 assign Q=D;
endmodule
module schedule_top(input clk, input [2:0] a, input [7:0] d, output [63:0] q);
 schedule_ram a0(clk,a,d,q[7:0]);
 schedule_ram a1(clk,a,d,q[15:8]);
 schedule_ram a2(clk,a,d,q[23:16]);
 schedule_ram a3(clk,a,d,q[31:24]);
 schedule_ram b0(clk,a,d,q[39:32]);
 schedule_ram b1(clk,a,d,q[47:40]);
 schedule_ram c0(clk,a,d,q[55:48]);
 schedule_ram d0(clk,a,d,q[63:56]);
endmodule
