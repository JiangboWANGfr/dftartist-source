module domain_resolved(input [1:0] clk, input [2:0] a, input [7:0] d, output [47:0] q);
 wire inv=~clk[0]; wire twice=~inv;
 clock_ram direct0(clk[0],a,d,q[7:0]);
 clock_ram direct1(clk[1],a,d,q[15:8]);
 clock_ram inverted(inv,a,d,q[23:16]);
 clock_ram double_inv(twice,a,d,q[31:24]);
 clock_ram_neg neg_inv(inv,a,d,q[39:32]);
 clock_branch branch(clk[0],a,d,q[47:40]);
endmodule
module domain_top(input [1:0] clk, input en, input [2:0] a, input [7:0] d, output [55:0] q);
 wire gate=clk[0]&en;
 domain_resolved resolved(clk,a,d,q[47:0]);
 clock_ram unknown(gate,a,d,q[55:48]);
endmodule
