module rule_ram(input CLK, input [2:0] A, input [7:0] D, output [7:0] Q); assign Q=D; endmodule
module rule_group(input clk,input [2:0] a,input [7:0] d,output [15:0] q);
 rule_ram ram(clk,a,d,q[7:0]); rule_ram \ram.dot (clk,a,d,q[15:8]);
endmodule
module rule_top(input clk,input [2:0] a,input [7:0] d,output [63:0] q);
 rule_group left(clk,a,d,q[15:0]); rule_group left_more(clk,a,d,q[31:16]);
 rule_group \left.dot (clk,a,d,q[47:32]);
 for(genvar i=0;i<2;i++) begin:bank rule_ram mem(clk,a,d,q[48+i*8+:8]); end
endmodule
