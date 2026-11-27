// Independent KATs: DESIGN 4.4/4.6/5.4 and public review inputs C-35--C-42.
module review_split(.joined({hi[1:0], lo[1:0]}));
  input wire [1:0] hi, lo;
endmodule
module review_ansi_split(input .joined({hi[1:0], lo[1:0]}));
  wire [1:0] hi, lo;
endmodule
module composite_xor(input wire [3:0] a, b);
  review_split u(.joined(a ^ b));
endmodule
module composite_mux(input wire [3:0] a, b, input wire sel);
  review_split u(.joined(sel ? a : b));
endmodule
module ansi_xor(input wire [3:0] a, b);
  review_ansi_split u(.joined(a ^ b));
endmodule
module ansi_mux(input wire [3:0] a, b, input wire sel);
  review_ansi_split u(.joined(sel ? a : b));
endmodule

module review_unsigned(output wire [1:0] q);
  assign q = 2'b10;
endmodule
module review_signed(output wire signed [1:0] q);
  assign q = 2'b10;
endmodule
module review_wide(output wire [3:0] q);
  assign q = 4'b1010;
endmodule
module output_widths(output wire [3:0] u4, s4, cat, output wire [1:0] t2);
  review_unsigned u_zero(.q(u4));
  review_signed u_sign(.q(s4));
  review_wide u_trunc(.q(t2));
  review_wide u_concat(.q({cat[1:0], cat[3:2]}));
endmodule

module review_remote(input wire d);
  wire s;
  assign s = d;
endmodule
module external_init(input wire a, output wire y);
  review_remote u(.d(a));
  wire x = u.s;
  assign y = x;
endmodule
module external_assign(input wire a, output wire y);
  review_remote u(.d(a));
  wire x;
  assign x = u.s;
  assign y = x;
endmodule
module review_sink(input wire d);
endmodule
module external_input(input wire a);
  review_remote u(.d(a));
  review_sink v(.d(u.s));
endmodule
module review_source(input wire d, output wire q);
  assign q = d;
endmodule
module external_output(input wire a);
  review_remote u(.d(a));
  review_source v(.d(a), .q(u.s));
endmodule

module positional_blackbox(input wire a, output wire y);
  absent_review u(a, y);
endmodule
module positional_gap(input wire a, output wire y);
  absent_review u(a, , y);
endmodule
module named_blackbox(input wire a, output wire y);
  absent_review u(.A(a), .X(), .Y(y));
endmodule
interface review_bus;
  logic s;
  modport sink(input s);
endinterface
module review_interface_user(review_bus.sink b);
endmodule
module interface_boundary;
  review_bus u();
  review_interface_user v(.b(u));
endmodule

module constant_if(input wire a, b, output logic y);
  always_comb if (1) y = a; else y = b;
endmodule
module parameter_if #(parameter bit TAKE = 1)(input wire a, b, output logic y);
  always_comb if (TAKE) y = a; else y = b;
endmodule
module nested_if(input wire a, b, c, output logic y, z);
  always_comb begin
    y = a;
    z = c;
    if (1) begin
      if (0) begin y = b; z = b; end
      else y = a;
    end else begin y = b; z = b; end
  end
endmodule
module parameter_cases(input wire a, b, output wire y1, y0);
  parameter_if #(.TAKE(1)) yes(.a(a), .b(b), .y(y1));
  parameter_if #(.TAKE(0)) no(.a(a), .b(b), .y(y0));
endmodule
module constant_reset(input wire clk, rst_n, output logic q);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q <= 1'b0; else q <= 1'b1;
endmodule
module constant_set(input wire clk, set, output logic q);
  always_ff @(posedge clk or posedge set)
    if (set) q <= 1'b1; else q <= 1'b0;
endmodule
module reset_set_priority(input wire clk, rst_n, set, output logic [1:0] q);
  always_ff @(posedge clk or negedge rst_n or posedge set)
    if (!rst_n) q <= 2'b00;
    else if (set) q <= 2'b11;
    else q <= 2'b01;
endmodule
