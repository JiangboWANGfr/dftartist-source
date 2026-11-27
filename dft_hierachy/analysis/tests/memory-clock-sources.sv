module clock_ram(input CLK, input [2:0] A, input [7:0] D, output [7:0] Q);
 assign Q=D;
endmodule
module clock_ram_neg(input CLK, input [2:0] A, input [7:0] D, output [7:0] Q);
 assign Q=D;
endmodule
module clock_branch(input clk, input [2:0] a, input [7:0] d, output [7:0] q);
 wire alias_clk=clk;
 clock_ram nested(alias_clk,a,d,q);
endmodule
module clock_top(input [1:0] clk, input en, input [2:0] a, input [7:0] d, output [119:0] q);
 wire inv=~clk[0];
 wire twice=~inv;
 wire off=clk[0]&1'b0;
 wire mux=en?clk[0]:clk[1];
 wire gate=clk[0]&en;
 wire loose;
 wire loop_a,loop_b;
 assign loop_a=loop_b; assign loop_b=loop_a;
 wire multi;
 assign multi=clk[0]; assign multi=clk[1];
 reg gen;
 always @(posedge clk[0]) gen<=~gen;
 clock_ram direct0(clk[0],a,d,q[7:0]);
 clock_ram direct1(clk[1],a,d,q[15:8]);
 clock_ram inverted(inv,a,d,q[23:16]);
 clock_ram double_inv(twice,a,d,q[31:24]);
 clock_ram_neg neg_inv(inv,a,d,q[39:32]);
 clock_branch branch(clk[0],a,d,q[47:40]);
 clock_ram constant0(1'b0,a,d,q[55:48]);
 clock_ram folded(off,a,d,q[63:56]);
 clock_ram floating(loose,a,d,q[71:64]);
 clock_ram generated(gen,a,d,q[79:72]);
 clock_ram selected(mux,a,d,q[87:80]);
 clock_ram gated(gate,a,d,q[95:88]);
 clock_ram cycle(loop_a,a,d,q[103:96]);
 clock_ram multiple(multi,a,d,q[111:104]);
 clock_ram open_pin(,a,d,q[119:112]);
endmodule
