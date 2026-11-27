module source_wrapper(input wire a, output wire [3:0] y);
  for (genvar n = 0; n < 4; ++n) begin : g
    source_leaf child(.a(a), .y(y[n]));
  end
endmodule
