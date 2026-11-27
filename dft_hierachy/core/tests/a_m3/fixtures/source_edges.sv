`define A_INNER(N, D) wire N = D;
`define A_OUTER(N, D) `A_INNER(N, D)
module source_edge_leaf(a, b, q);
  input wire a, b;
  output logic q;
  wire first, second;
  `A_OUTER(nested, a)
  always_ff @(posedge a) q <= b;
endmodule
module source_edge_top(input wire a, b, output wire q);
  wire left, right;
  source_edge_leaf named(.a(a & b), .b(), .q(left));
  source_edge_leaf positional(a, b, right);
  source_edge_leaf arrayed[0:11](.a(a), .b(b), .q());
  wire primitive_value;
  buf gate(primitive_value, a);
  missing_source_cell unknown(.A(b));
  assign q = left ^ right;
endmodule
