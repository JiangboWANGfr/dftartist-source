`include "source-evidence-excerpts-leaf.svh"
module excerpt_top(input logic clk,input logic [3:0] d,output logic [3:0] own,a,b,c,e);
 excerpt_leaf left(clk,d,a,b),right(clk,d,c,e);
 always @(posedge clk) own<=d;
endmodule
