module logic_buffer(input logic clk, rst, d, output logic q);
  wire buffered;
  assign buffered = clk;
  cell_ff u(buffered, rst, d, q);
endmodule
module logic_invert(input logic clk, rst, d, output logic q);
  wire inverted;
  assign inverted = ~clk;
  cell_ff u(inverted, rst, d, q);
endmodule
module logic_concat(input logic [3:0] clocks, input logic d, output logic [1:0] q);
  wire [7:0] mapped;
  assign mapped[6:3] = {1'b0, clocks[3], clocks[1], 1'b1};
  cell_ff direct(mapped[5], mapped[4], d, q[0]);
  cell_ff tied(mapped[3], mapped[6], d, q[1]);
endmodule
module logic_boolean(input logic clk, rst, d, output logic [3:0] q);
  wire a, b, c, off;
  assign a = clk & 1'b1;
  assign b = clk | 1'b0;
  assign c = clk ^ 1'b1;
  assign off = clk & 1'b0;
  cell_ff u0(a, rst, d, q[0]);
  cell_ff u1(b, rst, d, q[1]);
  cell_ff u2(c, rst, d, q[2]);
  cell_ff u3(off, rst, d, q[3]);
endmodule
module logic_mux(input logic clk, rst, sel, d, output logic [1:0] q);
  wire unused, chosen, same;
  assign chosen = 1'b0 ? unused : clk;
  assign same = sel ? clk : clk;
  cell_ff a(chosen, rst, d, q[0]);
  cell_ff b(same, rst, d, q[1]);
endmodule
module logic_derived(input logic clk, rst, d, output logic [1:0] q);
  logic divided;
  wire copy;
  always_ff @(posedge clk) divided <= ~divided;
  assign copy = divided;
  cell_ff clocked(copy, rst, d, q[0]);
  cell_ff reset(clk, copy, d, q[1]);
endmodule
module logic_bypass(input logic clk, rst, sel, d, output logic q);
  logic divided;
  wire muxed;
  always_ff @(posedge clk) divided <= ~divided;
  assign muxed = sel ? clk : divided;
  cell_ff u(muxed, rst, d, q);
endmodule
module logic_procedure(input logic clk, rst, d, output logic q);
  logic assigned;
  always_comb assigned = clk;
  cell_ff u(assigned, rst, d, q);
endmodule
module logic_conversion(input logic clk, rst, d, output logic q);
  wire [1:0] converted;
  assign converted = clk;
  cell_ff u(converted[0], rst, d, q);
endmodule
module logic_cycle(input logic rst, d, output logic q);
  wire a, b;
  assign a = b;
  assign b = a;
  cell_ff u(a, rst, d, q);
endmodule
module logic_multiple(input logic clk, rst, d, output logic q);
  wire a;
  assign a = clk;
  assign a = rst;
  cell_ff u(a, rst, d, q);
endmodule
module logic_fourstate(input logic rst, d, output logic [3:0] q);
  wire zed = 1'bz;
  wire xed = 1'bx;
  wire a, b, c, merged;
  assign a = 1'b1 & zed;
  assign b = ~zed;
  assign c = 1'b0 & xed;
  assign merged = xed ? 1'bz : 1'bz;
  cell_ff u0(a, rst, d, q[0]);
  cell_ff u1(b, rst, d, q[1]);
  cell_ff u2(c, rst, d, q[2]);
  cell_ff u3(merged, rst, d, q[3]);
endmodule
module logic_port_expression(input logic clk, rst, d, output logic q);
  cell_ff u(~clk, rst, d, q);
endmodule
module logic_reorder(input logic [3:0] clocks, input logic d, output logic q);
  wire a, b;
  assign {b, a} = {clocks[3], clocks[1]};
  cell_ff u(b, a, d, q);
endmodule
module logic_counter(input logic clk, rst, d, output logic q);
  logic [1:0] counter;
  always_ff @(posedge clk) counter <= counter + 1'b1;
  cell_ff u(counter[1], rst, d, q);
endmodule
