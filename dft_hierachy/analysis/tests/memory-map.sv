module mapped_ram #(parameter AW=3, DW=8)(input wire CLK, input wire [AW-1:0] A,
 input wire [DW-1:0] D, output wire [DW-1:0] Q, input wire WE, CEN, input wire [1:0] MASK);
 assign Q=D;
endmodule
module plain_ram(input wire ck,input wire [1:0] addr,input wire [3:0] din,output wire [3:0] dout);
 assign dout=din;
endmodule
module map_bank(input wire clk,input wire [7:0] d,output wire [15:0] q);
 mapped_ram a(clk,3'b000,d,q[7:0],1'b0,1'b0,2'b11);
 mapped_ram b(clk,3'b101,{d[3:0],d[7:4]},q[15:8],1'b1,1'b0,2'b00);
endmodule
module map_top(input wire CLK,input wire [7:0] D,output wire [15:0] Q);
 wire [15:0] other;
 map_bank left(CLK,D,Q),right(CLK,D,other);
 wire [3:0] narrowQ,plainQ;
 mapped_ram #(.AW(2),.DW(4)) narrow(CLK,2'b00,D[3:0],narrowQ,1'b0,1'b0,2'b11);
 mapped_ram \ram.dot (CLK,3'b000,8'b01010101,,1'b0,1'b0,2'b11);
 for(genvar i=0;i<2;i++)begin:g
  wire [7:0] q; mapped_ram m(CLK,3'b000,D,q,1'b0,1'b0,2'b11);
 end
 plain_ram plain(CLK,2'b00,D[3:0],plainQ);
endmodule
