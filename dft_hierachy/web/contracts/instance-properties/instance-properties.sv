// A query-capability witness, not independent B oracle or model runtime tests.
module property_leaf #(parameter int W = 3)(
  input logic [W-1:0] a,
  output logic [W-1:0] y
);
  localparam int DOUBLE_W = W * 2;
  assign y = a;
endmodule

module property_empty;
endmodule

module property_top;
  property_leaf #(.W(3)) narrow(.a(3'b0), .y());
  property_leaf #(.W(7)) wide(.a(7'b0), .y());
  property_empty empty();
endmodule
