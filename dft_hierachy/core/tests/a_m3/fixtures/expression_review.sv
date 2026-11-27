`ifndef PIN_WIDTH
`define PIN_WIDTH 6
`endif
`ifndef SIGNED_INPUT
`define SIGNED_INPUT
`endif

module declared_input(input wire [`PIN_WIDTH-1:0] A);
endmodule
module library_context(input wire `SIGNED_INPUT [3:0] a, b);
  absent_cell named(.A(a & b));
  absent_cell positional(a & b);
  declared_input reference_and(.A(a & b));
  absent_cell added(.A(a + b));
  declared_input reference_add(.A(a + b));
  absent_cell inverted(.A(~a));
  declared_input reference_not(.A(~a));
  absent_cell constant_input(.A(~4'b0000));
  declared_input reference_const(.A(~4'b0000));
endmodule

module summary_coverage(input wire [3:0] a, b, input wire sel,
                        output wire [3:0] reduced, compared, signed_reduce, repeated,
                        output wire [5:0] mixed,
                        output wire [7:0] controlled, full_control,
                        output wire equal_bit);
  assign reduced = 4'(|a);
  assign compared = 4'(a == b);
  assign signed_reduce = 4'($signed(|a));
  assign repeated = {4{a == b}};
  assign mixed = 6'({a, |b});
  assign controlled = 8'({sel ? a : b});
  assign full_control = 8'(sel ? a : b);
  assign equal_bit = a == b;
endmodule

module streaming_inputs(input wire [7:0] a, b,
                        output wire [7:0] selected,
                        output wire [15:0] nested);
  assign selected = {<<2{a}};
  assign nested = {<<{{>>{a}}, b}};
endmodule
