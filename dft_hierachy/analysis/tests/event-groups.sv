module events_same(input logic c, input logic [2:0] d, output logic [3:0] q);
  always @(posedge c) q[2:0] <= d;
  always @(posedge c) q[3:1] <= d;
endmodule
module events_cross(input logic c, input logic [2:0] d, output logic [3:0] q);
  always @(posedge c) q[2:0] <= d;
  always @(negedge c) q[3:1] <= d;
endmodule
module events_three(input logic c0,c1,c2, input logic [3:0] d, output logic [3:0] q);
  always @(posedge c0) q <= d;
  always @(posedge c1) q <= d;
  always @(posedge c2) q <= d;
endmodule
module events_disjoint(input logic c, input logic [1:0] d, output logic [3:0] q);
  always @(posedge c) q[1:0] <= d;
  always @(negedge c) q[3:2] <= d;
endmodule
module events_reset(input logic c,r0,r1,d, output logic [1:0] q);
  always @(posedge c or negedge r0) if (!r0) q[0] <= 0; else q[0] <= d;
  always @(posedge c or negedge r1) if (!r1) q[1] <= 0; else q[1] <= d;
endmodule
module events_roles(input logic c,r,d, output logic q);
  always @(posedge c or posedge r) if (r) q <= 1; else q <= d;
  always @(posedge c or negedge r) if (!r) q <= 0; else q <= d;
endmodule
