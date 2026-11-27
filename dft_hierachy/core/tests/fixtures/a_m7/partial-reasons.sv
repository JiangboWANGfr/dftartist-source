module partial_leaf(input logic a, output logic y);
  for (genvar i = 0; i < 40; i++) begin : g
    mystery missing(.A(a), .Y(y));
  end
endmodule
module partial_reasons_top(input logic a, output logic y, output logic z);
  partial_leaf left(.a(a), .y(y));
  partial_leaf right(.a(a), .y(z));
endmodule
