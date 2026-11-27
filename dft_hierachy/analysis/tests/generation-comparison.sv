module generation_polarity(input logic clk, rst, sel, d, output logic q);
  logic generated;
  wire chosen = sel ? ~clk : clk;
  always_ff @(posedge chosen) generated <= d;
  cell_ff u(generated,rst,d,q);
endmodule
module generation_async(input logic clk, rst, other_rst, sel, d, output logic q);
  logic generated;
  wire chosen = sel ? other_rst : rst;
  always_ff @(posedge clk or negedge chosen) if (!chosen) generated <= 0; else generated <= d;
  cell_ff u(generated,rst,d,q);
endmodule
