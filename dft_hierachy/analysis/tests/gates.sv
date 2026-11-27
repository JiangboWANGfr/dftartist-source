module gates_generated(input logic clk, rst, d, output logic q);
  logic enable;
  always_ff @(posedge clk) enable <= d;
  wire gated;
  assign gated = clk & enable;
  cell_ff u(gated, rst, d, q);
endmodule
module gates_or(input logic clk, rst, d, output logic q);
  logic enable;
  always_ff @(posedge clk) enable <= d;
  wire gated;
  assign gated = enable | clk;
  cell_ff u(gated, rst, d, q);
endmodule
module gates_invert(input logic clk, rst, d, output logic q);
  logic enable;
  always_ff @(posedge clk) enable <= d;
  wire gated;
  assign gated = ~(~clk & ~enable);
  cell_ff u(gated, rst, d, q);
endmodule
module gates_primary(input logic clk, en, rst, d, output logic q);
  wire gated;
  assign gated = clk & en;
  cell_ff u(gated, rst, d, q);
endmodule
module gates_undriven(input logic clk, rst, d, output logic q);
  wire enable, gated;
  assign gated = clk & enable;
  cell_ff u(gated, rst, d, q);
endmodule
module gates_constants(input logic clk, rst, d, output logic [3:0] q);
  wire a, b, c, e;
  assign a = clk & 1'b1;
  assign b = clk | 1'b0;
  assign c = clk & 1'b0;
  assign e = clk | 1'b1;
  cell_ff u0(a,rst,d,q[0]); cell_ff u1(b,rst,d,q[1]);
  cell_ff u2(c,rst,d,q[2]); cell_ff u3(e,rst,d,q[3]);
endmodule
module gates_bypass(input logic clk, sel, rst, d, output logic q);
  logic enable;
  always_ff @(posedge clk) enable <= d;
  wire gated, chosen;
  assign gated = clk & enable;
  assign chosen = sel ? clk : gated;
  cell_ff u(chosen, rst, d, q);
endmodule
module gates_nested(input logic clk, rst, d, output logic q);
  logic enable, second;
  always_ff @(posedge clk) begin enable <= d; second <= enable; end
  wire gated;
  assign gated = (clk & enable) & second;
  cell_ff u(gated, rst, d, q);
endmodule
module gates_bus(input logic [7:4] clocks, input logic rst, d, output logic q);
  logic enable;
  always_ff @(posedge clocks[7]) enable <= d;
  wire gated;
  assign gated = clocks[7] & enable;
  cell_ff u(gated, rst, d, q);
endmodule
module gates_hier(input logic [7:4] clocks, input logic rst, d, output logic q);
  gates_bus child({clocks[5],clocks[7],clocks[4],clocks[6]},rst,d,q);
endmodule
module gates_vector(input logic [3:0] clocks, input logic rst, d, output logic q);
  logic enable;
  always_ff @(posedge clocks[2]) enable <= d;
  wire [3:0] gated;
  assign gated = clocks & {enable,enable,enable,enable};
  cell_ff u(gated[2],rst,d,q);
endmodule
module gates_roots(input logic clk, other, rst, d, output logic q);
  wire gated;
  assign gated = clk & other;
  cell_ff u(gated,rst,d,q);
endmodule
module gates_async(input logic clk, d, output logic q);
  logic enable;
  always_ff @(posedge clk) enable <= d;
  wire gated;
  assign gated = clk & enable;
  cell_ff u(clk,gated,d,q);
endmodule
module gates_procedure(input logic clk, rst, d, output logic q);
  logic enable, gated;
  always_ff @(posedge clk) enable <= d;
  always_comb gated = clk & enable;
  cell_ff u(gated,rst,d,q);
endmodule
