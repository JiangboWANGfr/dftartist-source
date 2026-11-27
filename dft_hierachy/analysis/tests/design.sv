module cell_ff(input logic c, r, d, output logic q);
  always_ff @(posedge c or negedge r) if (!r) q <= 0; else q <= d;
endmodule
module clean(input logic clk, rst, sync_rst, d, output logic q, s);
  cell_ff u(clk, rst, d, q);
  always_ff @(posedge clk) if (sync_rst) s <= 0; else s <= d;
endmodule
module undriven(input logic d, output logic q);
  wire clk;
  wire rst;
  cell_ff u(clk, rst, d, q);
endmodule
module constant_control(input logic d, output logic q);
  cell_ff u(1'b0, 1'b1, d, q);
endmodule
module generated_control(input logic clk, en, d, output logic q);
  wire gated;
  assign gated = clk & en;
  cell_ff u(gated, en, d, q);
endmodule
module split_bits(input logic [1:0] clock_bus, input logic rst, d, output logic [1:0] q);
  cell_ff a(clock_bus[1], rst, d, q[0]);
  cell_ff b(clock_bus[0], rst, d, q[1]);
endmodule
module with_blackbox(input logic clk, d, output logic q);
  unknown_cell b(clk, d, q);
endmodule
module empty(input logic a, output wire y);
  assign y = a;
endmodule
module reused_roles(input logic clk, d, output logic [1:0] q);
  wire unavailable;
  always_ff @(posedge unavailable) q[0] <= d;
  always_ff @(posedge clk or negedge unavailable) if (!unavailable) q[1] <= 0; else q[1] <= d;
endmodule
module mixed_controls(input logic clk, en, d, output logic [1:0] q);
  wire dead;
  wire gated;
  assign gated = clk & en;
  cell_ff a(dead, en, d, q[0]);
  cell_ff b(gated, en, d, q[1]);
endmodule
module unconnected_control(input logic rst, d, output logic q);
  cell_ff u(.r(rst), .d(d), .q(q));
endmodule
module bidirectional_control(inout wire clk, input logic d, output logic q);
  always_ff @(posedge clk) q <= d;
endmodule
