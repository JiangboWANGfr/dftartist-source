// B independent C-37/C-43 KATs; no implementation-derived expected data.
module follow_target;
  wire s;
endmodule
module follow_variable;
  logic s;
endmodule
module follow_rw(inout wire p, input wire d, output wire q);
  assign p = d;
  assign q = p;
endmodule
module direction_inout(input wire d, output wire y);
  follow_target u();
  follow_rw v(.p(u.s), .d(d), .q(y));
endmodule
module direction_tran(inout wire d);
  follow_target u();
  tran v(u.s, d);
endmodule
module direction_tranif(input wire enable, inout wire d);
  follow_target u();
  tranif1 v(u.s, d, enable);
endmodule
module follow_ref(ref logic p, input wire d, output wire q);
  always_comb p = d;
  assign q = p;
endmodule
module direction_ref(input wire d, output wire y);
  follow_variable u();
  follow_ref v(.p(u.s), .d(d), .q(y));
endmodule
module library_named;
  follow_target u();
  absent_follow v(.Y(u.s));
endmodule
module library_position;
  follow_target u();
  absent_follow v(u.s);
endmodule
module occurrence_parent(input wire d, output wire y);
  follow_target u[1:0]();
  assign y = u[1].s ^ d;
endmodule
module direction_occurrences(input wire a, b, output wire x, y);
  occurrence_parent left(.d(a), .y(x));
  occurrence_parent right(.d(b), .y(y));
endmodule

module concat_class(input wire clk, rst_n, d, output logic hi, lo);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) {hi, lo} <= 2'b10;
    else {hi, lo} <= {d, d};
endmodule
module split_class(input wire clk, rst_n, d, output logic hi, lo);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) begin hi <= 1'b1; lo <= 1'b0; end
    else begin hi <= d; lo <= d; end
endmodule
module slice_class(input wire clk, rst_n, input wire [3:0] d, output logic [7:4] q);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) {q[7:6], q[5:4]} <= 4'b0010;
    else q <= d;
endmodule
module split_slice_class(input wire clk, rst_n, input wire [3:0] d, output logic [7:4] q);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) begin q[7:6] <= 2'b00; q[5:4] <= 2'b10; end
    else q <= d;
endmodule
module nested_class(input wire clk, rst_n, d, output logic hi, mid, lo);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) {hi, {mid, lo}} <= 3'b101;
    else {hi, mid, lo} <= {3{d}};
endmodule
module unknown_class(input wire clk, rst_n, d, output logic hi, lo);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) {hi, lo} <= 2'bx0;
    else {hi, lo} <= {d, d};
endmodule
module whole_class(input wire clk, rst_n, input wire [3:0] d, output logic [3:0] q);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q <= 4'b0010;
    else q <= d;
endmodule
