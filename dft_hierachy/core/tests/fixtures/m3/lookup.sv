module path_leaf(input wire clk, d, output wire q);
  logic state;
  always_ff @(posedge clk) state <= d;
  assign q = state;
endmodule
module path_unused;
endmodule
module alpha(input wire clk, d);
  wire q;
  path_leaf u_extra(.clk(clk), .d(d), .q());
  path_leaf u[3:1](.clk(clk), .d(d), .q());
  path_leaf \a.b (.clk(clk), .d(d), .q());
  path_leaf \slash/name (.clk(clk), .d(d), .q());
  path_leaf \u[3] (.clk(clk), .d(d), .q());
  for (genvar k=-1; k<=1; k++) begin : g
    path_leaf child(.clk(clk), .d(d), .q());
  end
endmodule
module beta(input wire clk, d);
  path_leaf u_extra(.clk(clk), .d(d), .q());
endmodule
