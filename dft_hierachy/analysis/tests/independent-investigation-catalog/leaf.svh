// B55 共享声明
module W_leaf(input c,input[3:0]d,output reg[3:0]y);always @(posedge c)y<=d;endmodule
