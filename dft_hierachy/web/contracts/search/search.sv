module search_leaf(input logic clk, input logic a, output logic y);
  logic needle;
  logic Needle;
  logic \literal*? ;
  assign needle = a;
  assign Needle = ~a;
  assign \literal*?  = needle;
  always_ff @(posedge clk) y <= needle;
endmodule

module search_top(input logic clk, input logic a, output wire [2:0] y);
  search_leaf left(.clk(clk), .a(a), .y(y[0]));
  search_leaf leftish(.clk(clk), .a(a), .y(y[1]));
  for (genvar i = 0; i < 1; ++i) begin : g
    search_leaf nested(.clk(clk), .a(a), .y(y[2]));
  end
endmodule

module second_top(input logic clk, input logic a, output wire y);
  search_leaf left(.clk(clk), .a(a), .y(y));
endmodule
