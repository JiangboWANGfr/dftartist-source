module split_review(.joined({hi[1:0], lo[1:0]}));
  input wire [1:0] hi, lo;
endmodule

module composite_expr(input wire [3:0] a, b, output wire tag);
  split_review u(.joined(a ^ b));
  assign tag = a[0];
endmodule

module composite_direct(input wire [3:0] a);
  split_review u(.joined(a));
endmodule

module explicit_review(input .joined({hi[1:0], lo[1:0]}));
  wire [1:0] hi, lo;
endmodule

module explicit_top(input wire [3:0] a);
  explicit_review u(.joined(a));
endmodule

module remote_review(input wire d);
  wire s;
  assign s = d;
endmodule

module external_init(input wire a, output wire y);
  remote_review u(.d(a));
  wire x = u.s;
  assign y = x;
endmodule

module external_assign(input wire a, output wire y);
  remote_review u(.d(a));
  wire x;
  assign x = u.s;
  assign y = x;
endmodule

module sink_review(input wire d);
endmodule

module external_binding(input wire a);
  remote_review u(.d(a));
  sink_review v(.d(u.s));
endmodule

interface review_bus;
  logic s;
endinterface

module interface_signal;
  review_bus u();
endmodule

module positional_blackbox(input wire a, output wire y);
  absent_review u(a, y);
endmodule

module named_blackbox(input wire a, output wire y);
  absent_review u(.A(a), .Y(y));
endmodule

module constant_if(input wire a, b, output logic y);
  always_comb begin
    if (1) y = a;
    else y = b;
  end
endmodule

module compound_assign(input wire a, b, output logic y);
  always_comb begin
    y = a;
    y ^= b;
  end
endmodule

module independent_clocks(input wire a, b, d, output logic q);
  always @(posedge a or posedge b) q <= d;
endmodule

module constant_reset(input wire clk, rst_n, output logic q);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q <= 1'b0;
    else q <= 1'b1;
endmodule

module narrow_output(output wire [1:0] q);
  assign q = 2'b10;
endmodule

module output_extend(output wire [3:0] y);
  narrow_output u(.q(y));
endmodule

module composite_mux(input wire [3:0] a,b, input wire c, output wire tag);
  split_review u(.joined(c ? a : b));
  assign tag = c;
endmodule
module explicit_expr(input wire [3:0] a,b);
  explicit_review u(.joined(a ^ b));
endmodule
module signed_output(input wire signed [1:0] d, output wire signed [1:0] q);
  assign q=d;
endmodule
module output_sign(input wire signed [1:0] a, output wire [3:0] y);
  signed_output u(.d(a),.q(y));
endmodule
module wide_output(input wire [3:0] d, output wire [3:0] q);
  assign q=d;
endmodule
module output_truncate(input wire [3:0] a, output wire [1:0] y);
  wide_output u(.d(a),.q(y));
endmodule
module output_concat(output wire [1:0] hi,lo);
  narrow_output u(.q({hi,lo}));
endmodule
module external_occurrence(input wire [1:0] a, output wire y);
  remote_review u[1:0](a);
  wire x = u[1].s;
  assign y=x;
endmodule
module bit_output(output wire q);
  assign q=1'b1;
endmodule
module external_output(input wire a);
  remote_review u(.d(a));
  bit_output v(.q(u.s));
endmodule
module positional_empty(input wire a, output wire y);
  absent_review u(a,,y);
endmodule
module library_output(output wire [3:0] y);
  absent_review u(.Y(y));
endmodule
module interface_consumer(review_bus b, input wire d);
endmodule
module interface_binding(input wire d);
  review_bus bus();
  interface_consumer u(.b(bus),.d(d));
endmodule
module constant_false(input wire a,b, output logic y,z);
  localparam P=0;
  always_comb
    if (P) begin y=a; z=a; end
    else if (1) y=b;
    else begin y=a; z=b; end
endmodule
module constant_nested(input wire a,b,c, output logic y,z);
  always_comb
    if (c) begin
      if (0) z=b;
      else y=a;
    end else y=b;
endmodule
module constant_set(input wire clk,set,output logic q);
  always_ff @(posedge clk or posedge set)
    if(set) q<=1'b1;
    else q<=1'b0;
endmodule
module reset_else(input wire clk,rst_n,output logic q);
  always_ff @(posedge clk or negedge rst_n)
    if(rst_n) q<=1'b1;
    else q<=1'b0;
endmodule
module two_async(input wire clk,rst_n,set,output logic [1:0] q);
  always_ff @(posedge clk or negedge rst_n or posedge set)
    if(!rst_n) begin q[0]<=1'b0; q[1]<=1'b1; end
    else if(set) q<=2'b11;
    else q<=2'b00;
endmodule
