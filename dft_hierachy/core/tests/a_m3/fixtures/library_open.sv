module library_repeat(input logic [7:0] d);
  absent_open cell0(.A({<<{d}}));
endmodule

module library_repeated_top(input logic [7:0] d);
  library_repeat u[3:0](.d(d));
endmodule

module library_target;
  wire [7:0] s;
endmodule

module library_external_top;
  library_target u[1:0]();
  absent_open cell0(.A(u[1].s));
endmodule
