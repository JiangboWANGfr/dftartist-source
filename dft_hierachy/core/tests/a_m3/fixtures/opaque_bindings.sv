module unknown_stream;
  wire [3:0] data, spare;
  missing_cell box(.P({<<{data}}));
endmodule
module known_stream;
  wire [3:0] data;
  output_cell4 box(.P({<<{data}}));
endmodule
module input_stream;
  wire [3:0] data;
  input_cell4 box(.P({<<{data}}));
endmodule
module output_cell4(output wire [3:0] P);
  assign P = 4'b1010;
endmodule
module input_cell4(input wire [3:0] P);
endmodule
module unknown_selected(input wire [1:0] selector);
  wire [7:0] data;
  missing_cell box(.P({<<{data[selector +: 2]}}));
endmodule
module unknown_rvalue;
  wire [3:0] a, b;
  missing_cell box(.P(a & b));
endmodule
