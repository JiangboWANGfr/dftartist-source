module scenarios_reindex(input logic c0,c1,sel, input logic [8:0] d, output logic [8:0] q);
  wire chosen=sel?c1:c0;
  always @(posedge chosen) q[3:0]<=d[3:0];
  always @(posedge c0) q[6:4]<=d[6:4];
  always @(posedge c1) q[8:7]<=d[8:7];
endmodule
module scenarios_overlap(input logic c0,c1,sel, input logic [3:0] d, output logic [3:0] q);
  wire chosen=sel?c1:c0;
  always @(posedge chosen) q[2:0]<=d[2:0];
  always @(negedge chosen) q[3:1]<=d[3:1];
endmodule
module scenarios_reset(input logic clk,r0,r1,sel, input logic [3:0] d, output logic [3:0] q);
  wire rst=sel?r1:r0;
  always @(posedge clk or negedge rst) if(!rst) q<=0;else q<=d;
endmodule
module scenarios_polarity(input logic clk,sel,d, output logic q);
  wire chosen=sel?~clk:clk;
  always @(posedge chosen) q<=d;
endmodule
