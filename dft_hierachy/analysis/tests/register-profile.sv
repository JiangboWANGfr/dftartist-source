module profile_alias(input logic clk,r0,r1, input logic [3:0] d, output logic [3:0] q);
  wire c0=clk, c1=clk;
  always @(posedge c0 or negedge r0) if(!r0) q[2:0]<=0; else q[2:0]<=d[2:0];
  always @(posedge c1 or negedge r1) if(!r1) q[3:1]<=0; else q[3:1]<=d[3:1];
endmodule
module profile_resets(input logic clk,r0,r1,d, output logic [1:0] q);
  always @(posedge clk or negedge r0) if(!r0) q[0]<=0; else q[0]<=d;
  always @(posedge clk or negedge r1) if(!r1) q[1]<=0; else q[1]<=d;
endmodule
module profile_invert(input logic clk, input logic [3:0] d, output logic [3:0] q);
  wire inv=~clk;
  always @(posedge clk) q[2:0]<=d[2:0];
  always @(posedge inv) q[3:1]<=d[3:1];
endmodule
module profile_modes(input logic c0,c1,sel, input logic [3:0] d, output logic [3:0] q);
  wire chosen=sel ? c1 : c0;
  always @(posedge chosen) q<=d;
endmodule
module profile_derived(input logic clk,d, output logic [2:0] q);
  logic divided;
  always @(posedge clk) divided<=~divided;
  always @(posedge divided) q<={3{d}};
endmodule
module profile_constant(input logic d, output logic [1:0] q);
  wire c=1'b0;
  always @(posedge c) q<={2{d}};
endmodule
module profile_undriven(input logic d, output logic [1:0] q);
  logic c;
  always @(posedge c) q<={2{d}};
endmodule
module profile_gate(input logic clk,en,d, output logic [1:0] q);
  wire c=clk & en;
  always @(posedge c) q<={2{d}};
endmodule
