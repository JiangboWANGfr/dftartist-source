module endpoint_leaf(input logic a, output wire y);
  assign y = a;
endmodule
module endpoint_top(input logic a, output wire [63:0] y);
  for (genvar i = 0; i < 64; i++) begin : g
    endpoint_leaf u(.a(a), .y(y[i]));
  end
endmodule
