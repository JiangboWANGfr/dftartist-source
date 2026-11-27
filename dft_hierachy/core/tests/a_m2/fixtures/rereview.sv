module target_wire;
  wire s;
endmodule
module rw_leaf(inout wire p, input wire d, output wire q);
  assign p = d;
  assign q = p;
endmodule
module ext_inout(input wire d, output wire y);
  target_wire u();
  rw_leaf v(.p(u.s), .d(d), .q(y));
endmodule
module ext_tran(inout wire d);
  target_wire u();
  tran v(u.s, d);
endmodule
module ext_buf(input wire d);
  target_wire u();
  buf v(u.s, d);
endmodule
module concat_reset(input wire clk,rst_n,d, output logic hi,lo);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) {hi,lo} <= 2'b10;
    else {hi,lo} <= {d,d};
endmodule
module split_reset(input wire clk,rst_n,d, output logic hi,lo);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) begin hi<=1'b1; lo<=1'b0; end
    else begin hi<=d; lo<=d; end
endmodule
module vector_reset(input wire clk,rst_n, input wire [1:0] d, output logic [1:0] q);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q <= 2'b10;
    else q <= d;
endmodule
module bit_driver(input wire d, output wire q);
  assign q=d;
endmodule
module dynamic_out(input wire d,idx, output wire [1:0] y);
  bit_driver u(.d(d), .q(y[idx]));
endmodule
module composite_out(.q({hi,lo}));
  output wire [1:0] hi,lo;
  assign hi=2'b10;
  assign lo=2'b01;
endmodule
module composite_output_wide(output wire [5:0] y);
  composite_out u(.q(y));
endmodule
module signed_source(input wire signed [1:0] a, output wire signed [1:0] q);
  assign q=a;
endmodule
module sign_out(input wire signed [1:0] a, output wire [3:0] y);
  signed_source u(.a(a),.q(y));
endmodule
module external_parent(input wire d, output wire q);
  target_wire u();
  wire x=u.s;
  assign q=x^d;
endmodule
module external_nested(input wire a,b, output wire y,z);
  external_parent v0(.d(a),.q(y));
  external_parent v1(.d(b),.q(z));
endmodule
module external_library_output;
  target_wire u();
  absent_cell v(.Y(u.s));
endmodule

module slice_reset(input logic clk, rst_n, d, output logic [3:0] q);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) {q[3:2], q[1:0]} <= 4'b1000;
    else q <= {4{d}};
endmodule
module nested_concat_reset(input logic clk, rst_n, d, output logic [3:0] q);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) {{q[3:2]}, {q[1:0]}} <= 4'b1000;
    else q <= {4{d}};
endmodule
module unknown_concat_reset(input logic clk, rst_n, d, output logic hi, lo);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) {hi,lo} <= 2'bx0;
    else {hi,lo} <= {d,d};
endmodule
module array_external_parent;
  target_wire u[0:1]();
  wire x = u[1].s;
endmodule
module nested_external;
  array_external_parent a();
  array_external_parent b();
endmodule
module ref_target;
  logic s;
endmodule
module ref_leaf(ref logic p, input logic d, output logic q);
  always_comb begin p = d; q = p; end
endmodule
module external_ref(input logic d, output logic y);
  ref_target u();
  ref_leaf v(.p(u.s), .d(d), .q(y));
endmodule
module bus_target;
  logic [1:0] s;
endmodule
module external_selector(input wire d, output wire y);
  bus_target u();
  target_wire index();
  always_comb u.s[index.s] = d;
  assign y = d;
endmodule
module external_tranif(inout wire d, input wire enable);
  target_wire u();
  tranif1 v(u.s, d, enable);
endmodule
