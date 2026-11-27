module usage_clean(input logic clk, rst, d, output logic q);
  cell_ff u(clk, rst, d, q);
endmodule
module usage_direct(input logic clk, input logic d, output logic q);
  always_ff @(posedge clk) q <= clk;
endmodule
module usage_depth(input logic clk, rst, d, output logic [1:0] q);
  always_ff @(posedge clk) q[0] <= clk;
  cell_ff u(clk, rst, d, q[1]);
endmodule
module usage_async(input logic clk, other, rst, d, output logic [1:0] q);
  cell_ff a(clk, rst, d, q[0]);
  cell_ff b(other, clk, d, q[1]);
endmodule
module usage_condition(input logic clk, d, output logic q);
  always_ff @(posedge clk) if (clk) q <= d;
endmodule
module usage_bits(input logic [3:0] bus, input logic rst, output logic q);
  cell_ff a(bus[1], rst, bus[2], q);
endmodule
module usage_cross(input logic [3:0] bus, input logic rst, d, output logic [1:0] q);
  cell_ff a(bus[3], rst, d, q[0]);
  cell_ff b(bus[1], rst, bus[3], q[1]);
endmodule
module usage_remap(input logic [7:4] bus, input logic rst, d, output logic [1:0] q);
  usage_cross u({bus[4], bus[6], bus[5], bus[7]}, rst, d, q);
endmodule
module usage_shared(input logic clk, rst, output logic [1:0] q);
  cell_ff a(clk, rst, clk, q[0]);
  cell_ff b(clk, rst, clk, q[1]);
endmodule
module usage_combinational(input logic clk, rst, d, output logic [1:0] q);
  wire copied;
  assign copied = clk;
  cell_ff a(clk, rst, d, q[0]);
  cell_ff b(copied, rst, d, q[1]);
endmodule
module usage_conservative(input logic clk, input logic [1:0] d, output logic q);
  always_ff @(posedge clk) q <= d[clk];
endmodule
module usage_opaque(input logic clk, rst, output logic q);
  missing_usage_box b(.in(clk));
  cell_ff a(clk, rst, clk, q);
endmodule
module usage_mixed(input logic clk, rst, d, output logic [1:0] q);
  cell_ff a(clk, rst, clk, q[0]);
  cell_ff b(1'b0, rst, d, q[1]);
endmodule
module usage_many(input logic clk, rst, output logic [35:0] q);
  for (genvar i = 0; i < 36; i++) begin : g
    cell_ff u(clk, rst, clk, q[i]);
  end
endmodule
