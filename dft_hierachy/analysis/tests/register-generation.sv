module rg_leaf(input logic c,r,input logic [3:0] d,output logic [3:0] q);
 always @(posedge c or negedge r) if(!r) q<=0;else q<=d;
endmodule
module rg_top(input logic clk,rst,d,output logic [3:0] q);
 logic first,second,reset_q;
 always @(posedge clk) first<=d;
 always @(posedge first) second<=d;
 always @(posedge rst) reset_q<=d;
 rg_leaf u(second,reset_q,{4{d}},q);
endmodule
