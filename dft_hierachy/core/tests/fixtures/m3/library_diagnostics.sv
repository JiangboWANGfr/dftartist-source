// Agent B: invalid assignments must remain browseable but visibly diagnosed.
`ifndef B_DIAG_WIDTH
`define B_DIAG_WIDTH 6
`endif
module diagnostic_declared(input wire [`B_DIAG_WIDTH-1:0] A);
endmodule
module diagnostic_lib_array(input wire [3:0] a [2]);
  absent_diag u(.A(a));
endmodule
module diagnostic_lib_stream(input wire [7:0] a);
  absent_diag u(.A({<<{a}}));
endmodule
module diagnostic_decl_array(input wire [3:0] a [2]);
  diagnostic_declared u(.A(a));
endmodule
module diagnostic_decl_stream(input wire [7:0] a);
  diagnostic_declared u(.A({<<{a}}));
endmodule
