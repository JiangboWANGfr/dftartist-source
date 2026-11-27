module scope_leaf(input wire a, output wire y);
  assign y = a;
endmodule
module query_scope_top(input wire a, output wire [2:0] y);
  scope_leaf u0(.a(a), .y(y[0]));
  scope_leaf u1(.a(a), .y(y[1]));
  scope_leaf u2(.a(a), .y(y[2]));
endmodule
