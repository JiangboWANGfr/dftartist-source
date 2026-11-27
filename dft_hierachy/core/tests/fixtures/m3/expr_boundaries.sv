// Agent B normative KATs: DESIGN 4.4 and 5.5.3; no implementation fixture.
module expr_summary(input wire [3:0] a, b, input wire sel,
                    output wire [3:0] reduce_ext, compare_ext, sign_full,
                    output wire [5:0] mixed, mixed_precision,
                    output wire [3:0] partial_control, full_control);
  assign reduce_ext = 4'(|a);
  assign compare_ext = 4'(a == b);
  assign mixed = 6'({a, |b});
  assign sign_full = 4'($signed(|a));
  assign mixed_precision = 6'({|a, (a[2:0] + b[2:0])});
  // Concat makes the mux self-determined at one bit before zero extension.
  assign partial_control = 4'({sel ? 1'b1 : 1'b0});
  assign full_control = 4'($signed(sel ? |a : |b));
endmodule

module shift_contract(input wire signed [3:0] s, input wire [3:0] u,
                      output wire [3:0] signed_one, unsigned_one,
                      signed_large, unsigned_large, logical_right, arithmetic_left,
                      output wire [5:0] context_signed, context_unsigned);
  assign signed_one = s >>> 1;
  assign unsigned_one = u >>> 1;
  assign signed_large = s >>> 7;
  assign unsigned_large = u >>> 7;
  assign logical_right = s >> 1;
  assign arithmetic_left = s <<< 1;
  assign context_signed = s >>> 1;
  assign context_unsigned = $unsigned(s) >>> 1;
endmodule

`ifndef B_PIN_WIDTH
`define B_PIN_WIDTH 6
`endif
module declared_input(input wire [`B_PIN_WIDTH-1:0] A);
endmodule
module lib_unsigned_named(input wire [3:0] a, b);
  absent_input u(.A(a & b));
  absent_input v(.A(a & b));
endmodule
module lib_unsigned_position(input wire [3:0] a, b);
  absent_input u(a & b);
  absent_input v(a & b);
endmodule
module lib_signed_named(input wire signed [3:0] a, b);
  absent_input u(.A(a & b));
endmodule
module lib_signed_position(input wire signed [3:0] a, b);
  absent_input u(a & b);
endmodule
module lib_arithmetic(input wire [3:0] a, b);
  absent_input u(.A(a + b));
endmodule
module lib_constant;
  wire checker_control = 1'b0;
  absent_input u(.A(~4'b1010));
endmodule
module declared_unsigned_named(input wire [3:0] a, b);
  declared_input u(.A(a & b));
endmodule
module declared_signed_named(input wire signed [3:0] a, b);
  declared_input u(.A(a & b));
endmodule
module declared_arithmetic(input wire [3:0] a, b);
  declared_input u(.A(a + b));
endmodule
module declared_constant;
  wire checker_control = 1'b0;
  declared_input u(.A(~4'b1010));
endmodule

// D-01: no internal cell definition is supplied; a/y are distinct scalar nets.
module loop_blackbox;
  wire a, y;
  wire checker_control = 1'b0;
  absent_loop u(.p({y, a}));
endmodule
