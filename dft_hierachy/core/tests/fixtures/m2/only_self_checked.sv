// `verify-facts` must not report Slang comparisons for these source kinds.
module only_init(input wire a);
  wire initialized = a;
endmodule

module input_sink(input wire d);
endmodule

module only_port_expr(input wire a, b);
  input_sink u_sink(.d(a & b));
endmodule
