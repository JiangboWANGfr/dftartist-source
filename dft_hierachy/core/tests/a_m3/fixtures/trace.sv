module trace_leaf(input wire [3:0] d, output wire [3:0] q);
  assign q = d;
endmodule
module trace_ports(input wire [3:0] a, b, output wire [3:0] y);
  trace_leaf u(.d(a ^ b), .q(y));
endmodule
module trace_partial(input wire [3:0] a, output wire [3:0] y);
  wire unused;
  assign y = a;
  buf gate(unused, y[3]);
endmodule
module trace_join(input wire a, output wire y);
  wire b, c;
  assign b = a;
  assign c = b;
  assign y = c;
  assign y = a;
endmodule
module trace_repeated(input wire a, output wire [1:0] y);
  wire [1:0] unused;
  trace_leaf u(.d({2'b00, a, a}), .q({unused, y}));
endmodule
module trace_opaque(input wire a);
  string label;
endmodule
module trace_const_ports(output wire [3:0] y);
  trace_leaf u(.d(4'b0101), .q(y));
endmodule
module trace_wire_ports(input wire [3:0] a, output wire [3:0] y);
  trace_leaf u(.d(a), .q(y));
endmodule
module trace_mapped_leaf(.d({lo, hi}), .q(q));
  input wire [1:0] hi, lo;
  output wire [3:0] q;
  assign q = {hi, lo};
endmodule
module trace_mapped_ports(input wire [3:0] a, b, output wire [3:0] y);
  trace_mapped_leaf u(.d(a & b), .q(y));
endmodule
module trace_primitive;
  wire a, y;
  buf g(y, a);
endmodule
