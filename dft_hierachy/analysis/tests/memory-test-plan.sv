module plan_ram #(parameter AW=3)(input CLK, input [AW-1:0] A, input [7:0] D, output [7:0] Q);
 assign Q=D;
endmodule
module plan_alt(input CLK, input [2:0] A, input [7:0] D, output [7:0] Q);
 assign Q=D;
endmodule
module plan_top(input clk, other, input [2:0] a, input [7:0] d, output [71:0] q);
 plan_ram a0(clk,a,d,q[7:0]);
 plan_ram b0(clk,a,d,q[15:8]);
 plan_ram c0(clk,a,d,q[23:16]);
 plan_ram d0(other,a,d,q[31:24]);
 plan_ram e0(clk,a,d,q[39:32]);
 plan_ram f0(clk,a,d,q[47:40]);
 plan_alt g0(clk,a,d,q[55:48]);
 plan_alt h0(clk,a,d,q[63:56]);
 plan_ram #(.AW(2)) x0(clk,a[1:0],d,q[71:64]);
endmodule
