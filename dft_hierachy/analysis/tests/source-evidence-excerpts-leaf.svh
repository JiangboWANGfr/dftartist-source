// 中文 UTF-8 前缀：共享模块的原物理字节。
module excerpt_leaf(
 input logic clk,input logic [3:0] d,
 output logic [3:0] q0,
 output logic [3:0] q1
);
 always @(posedge clk) begin
  q0<=d;
  q1<=d;
 end
endmodule
