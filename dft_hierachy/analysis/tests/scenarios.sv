module scenario_polarity(input logic clk, rst, sel, d, output logic q);
  wire chosen;
  assign chosen = sel ? ~clk : clk;
  cell_ff u(chosen,rst,d,q);
endmodule
module scenario_parity(input logic clk, rst, sel, d, output logic q);
  wire chosen;
  assign chosen = sel ? ~(~clk) : clk;
  cell_ff u(chosen,rst,d,q);
endmodule
module scenario_bus(input logic [7:4] clocks, input logic rst, sel, d, output logic q);
  wire chosen;
  assign chosen = sel ? clocks[7] : clocks[5];
  cell_ff u(chosen,rst,d,q);
endmodule
module scenario_shared(input logic clk, rst, sel, d, output logic [1:0] q);
  scenario_polarity a(clk,rst,sel,d,q[0]);
  scenario_polarity b(clk,rst,1'b0,d,q[1]);
endmodule
module scenario_fourstate(input logic rst, sel, d, output logic q);
  wire chosen;
  assign chosen = sel ? 1'bz : 1'bx;
  cell_ff u(chosen,rst,d,q);
endmodule
