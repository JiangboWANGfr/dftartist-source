// 中文和 UTF-8 字节：位置必须来自快照中的物理文件。
module locations_leaf(input logic clk,input logic [3:0] d,output logic [3:0] q0,q1);
 always @(posedge clk) begin q0<=d;q1<=d;end
endmodule
module locations_top(input logic clk,input logic [3:0] d,output logic [3:0] a,b,c,e);
 locations_leaf left(clk,d,a,b),right(clk,d,c,e);
endmodule
`define LOC_WRITE(clk,q,d) always @(posedge clk) q<=d;
module locations_macro(input logic clk,input logic [3:0] d,output logic [3:0] q);
 `LOC_WRITE(clk,q,d)
endmodule
