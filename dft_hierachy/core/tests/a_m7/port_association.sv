module association_leaf(input wire [1:0] a, input wire b = 1'b1, output wire y);
  assign y = ^a ^ b;
endmodule

module association_implicit(input wire [1:0] a, input wire b, output wire y);
  association_leaf u(.b, .y, .a);
endmodule

module association_wildcard(input wire [1:0] a, input wire b, output wire y);
  association_leaf u(.*);
endmodule

module association_default(input wire [1:0] a, output wire y);
  association_leaf u(.a(a), .y(y));
endmodule

module association_empty(input wire [1:0] a, output wire y);
  association_leaf u(a, , y);
endmodule

module association_duplicate(input wire a, b);
  association_unknown u(.X(a), .X(b));
endmodule

module association_duplicate_empty(input wire a);
  association_unknown u(.X(a), .X());
endmodule
