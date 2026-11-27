module b_trace_leaf(input wire [3:0] d, output wire [3:0] q);
  assign q = d;
endmodule
module b_trace_expr(input wire [3:0] a, b, output wire [3:0] q);
  b_trace_leaf leaf(.d(a & b), .q(q));
endmodule
module b_trace_constant(output wire [3:0] q);
  b_trace_leaf leaf(.d(4'b10xz), .q(q));
endmodule
module b_trace_wire(input wire [3:0] a, output wire [3:0] q);
  b_trace_leaf leaf(.d(a), .q(q));
endmodule
module b_trace_primitive;
  wire a, y;
  buf gate(y, a);
endmodule
module b_trace_unknown;
  wire a, y;
  absent_b_trace box(.A(a), .Y(y));
endmodule
