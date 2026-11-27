module values_clock(input logic clk, d, output logic q);
  always_ff @(posedge clk) q <= d;
endmodule
module values_or(input logic clk, en, rst, d, output logic q);
  wire gated;
  assign gated = clk | en;
  cell_ff u(gated,rst,d,q);
endmodule
module values_nested_mux(input logic clk, rst, d, input logic [1:0] mode, output logic q);
  logic divided;
  always_ff @(posedge clk) divided <= ~divided;
  wire chosen;
  assign chosen = mode[1] ? (mode[0] ? clk : divided) : clk;
  cell_ff u(chosen,rst,d,q);
endmodule
module values_leaf(input logic clk, rst, en, d, output logic q);
  wire gated;
  assign gated = clk & en;
  cell_ff u(gated,rst,d,q);
endmodule
module values_hier(input logic [7:4] modes, input logic clk, rst, d, output logic q);
  values_leaf child(clk,rst,modes[5],d,q);
endmodule
module values_inout(inout wire clk, input logic rst, d, output logic q);
  cell_ff u(clk,rst,d,q);
endmodule
