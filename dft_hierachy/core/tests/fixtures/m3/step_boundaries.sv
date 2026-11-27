// Independent B C53/C54 boundary inputs: exact bit widths, legal streaming lvalues.
module b_boundary_unknown;
  wire [3:0] data;
  absent_b_boundary box(.P({<<{data}}));
endmodule
module b_boundary_out;
  wire [3:0] data;
  b_boundary_output box(.P({<<{data}}));
endmodule
module b_boundary_in;
  wire [3:0] data;
  b_boundary_input box(.P({<<{data}}));
endmodule
module b_boundary_output(output wire [3:0] P);
  assign P = 4'b1010;
endmodule
module b_boundary_input(input wire [3:0] P);
endmodule
