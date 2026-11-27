module path_tail_top(input logic in, output wire out);
  for (genvar i = 0; i < 12; ++i) begin : bank
    for (genvar j = 0; j < 1; ++j) begin : stage
      logic value;
      assign value = in;
    end
  end
  assign out = in;
endmodule
