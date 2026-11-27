module property_leaf #(parameter int P=1, Q=2, R=3) (
    input logic [3:0] a, input logic clk, output logic [3:0] y,
    output logic \name.with.dot );
  logic [3:0] state;
  always_ff @(posedge clk) state <= a;
  assign y = state;
  assign \name.with.dot = a[0];
endmodule
module property_top(input logic [3:0] a, input logic clk, output wire [3:0] y);
  wire [3:0] other;
  property_leaf #(.P(1), .Q(2)) explicit_same(.a(a), .clk(clk), .y(y), .\name.with.dot ());
  property_leaf implicit_default(.a(a), .clk(clk), .y(other), .\name.with.dot ());
endmodule
