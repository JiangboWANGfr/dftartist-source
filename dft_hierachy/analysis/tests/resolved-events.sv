module resolved_alias(input logic clk,rst, input logic [3:0] d, output logic [3:0] q);
  wire c0=clk,c1=clk,r0=rst,r1=rst;
  always @(posedge c0 or negedge r0) if(!r0) q[2:0]<=0; else q[2:0]<=d[2:0];
  always @(posedge c1 or negedge r1) if(!r1) q[3:1]<=0; else q[3:1]<=d[3:1];
endmodule
module resolved_roles(input logic clk,rst, input logic [3:0] d, output logic [3:0] q);
  always @(posedge clk or posedge rst) if(rst) q[2:0]<=0; else q[2:0]<=d[2:0];
  always @(posedge clk or posedge rst) if(rst) q[3:1]<=7; else q[3:1]<=d[3:1];
endmodule
module resolved_invert(input logic clk,rst, input logic [3:0] d, output logic [3:0] q);
  wire r=~rst;
  always @(posedge clk or negedge rst) if(!rst) q[2:0]<=0; else q[2:0]<=d[2:0];
  always @(posedge clk or negedge r) if(!r) q[3:1]<=0; else q[3:1]<=d[3:1];
endmodule
module resolved_order(input logic clk,r0,r1,d, output logic q);
  always @(posedge clk or negedge r0 or negedge r1) if(!r0) q<=0;else if(!r1) q<=0;else q<=d;
  always @(posedge clk or negedge r1 or negedge r0) if(!r1) q<=0;else if(!r0) q<=0;else q<=d;
endmodule
module resolved_async_unknown(input logic clk,r0,r1,sel,d, output logic [3:0] q);
  wire r=sel ? r1 : r0;
  always @(posedge clk or negedge r) if(!r) q<=0; else q<={4{d}};
endmodule
