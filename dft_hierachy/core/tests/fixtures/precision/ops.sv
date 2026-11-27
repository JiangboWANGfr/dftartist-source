// One module per row of the precision rule table (docs/DESIGN.md 4.4), for verification
// item V5. Every module has the same inputs; the output is driven by a single operation
// of that row's class. expected.py holds the true per-bit dependencies and the rule
// table's answer; compare.py runs the old backend's wrapper analysis on each module.
module op_select_concat(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  assign y = {a[1:0], b[3:2]};
endmodule
module op_replicate(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  assign y = {2{a[1:0]}};
endmodule
module op_bitwise_and(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  assign y = a & b;
endmodule
module op_bitwise_not(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  assign y = ~a;
endmodule
module op_conditional(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  assign y = c ? a : b;
endmodule
module op_zero_extend(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  assign y = a[1:0];
endmodule
module op_sign_extend(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  assign y = $signed(a[1:0]);
endmodule
module op_shift_const(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  assign y = a << 1;
endmodule
module op_reduce_and(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  assign y = {3'b0, &a};
endmodule
module op_compare(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  assign y = {3'b0, a < b};
endmodule
module op_equal(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  assign y = {3'b0, a == b};
endmodule
module op_add(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  assign y = a + b;
endmodule
module op_multiply(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  assign y = a * b;
endmodule
module op_shift_var(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  assign y = a << s;
endmodule
module op_dynamic_index(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  assign y = {3'b0, a[s]};
endmodule
module op_dynamic_part(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  assign y = {2'b0, b[s +: 2]};
endmodule
module op_function(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  function automatic logic [3:0] swap(input logic [3:0] v);
    return {v[1:0], v[3:2]};
  endfunction
  assign y = swap(a);
endmodule
module op_proc_if(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  always_comb begin
    if (c) y = a;
    else   y = b;
  end
endmodule
module op_proc_case(input logic [3:0] a, b, input logic [1:0] s, input logic c, output logic [3:0] y);
  always_comb begin
    case (s)
      2'd0:    y = a;
      2'd1:    y = b;
      default: y = a & b;
    endcase
  end
endmodule
