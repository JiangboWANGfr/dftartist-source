module observed_intervals(input wire [4095:0] a, output wire [4095:0] y);
  for (genvar k=0; k<4096; k++) begin : g
    assign y[k] = a[k];
  end
endmodule

module observed_small(input wire [63:0] a, output wire [63:0] y);
  for (genvar k=0; k<64; k++) begin : g
    assign y[k] = a[k];
  end
endmodule

module observed_diamond(input wire a, output wire q);
  wire b, c;
  assign b = a;
  assign c = a;
  assign q = b | c;
endmodule
