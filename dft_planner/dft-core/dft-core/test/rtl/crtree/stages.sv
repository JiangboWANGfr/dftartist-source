// Multi-stage clock tree + the CONDITIONAL traversal rules.
//   u_icg1: TE tied 1        -> transparent
//   u_icg2: TE tied 1        -> transparent   => g2 sees CLKA (010)
//   u_icgX: both enables 0   -> BLOCKED       => gx must be X, not a clock
//   u_mux:  select tied 1    -> follows A1    => m1 sees CLKA through A1
//   u_muxX: select unknown   -> BLOCKED       => mx must be X
module my_icg(input logic CK, input logic FE, input logic TE, output logic GCK);
  assign GCK = CK & (FE | TE);
endmodule
module my_cinv(input logic CK, output logic GCK);
  assign GCK = ~CK;
endmodule
module my_cmux(input logic A0, input logic A1, input logic S0, output logic Y);
  assign Y = S0 ? A1 : A0;
endmodule
// A block whose ICG enable arrives THROUGH A PORT from the parent, and which also builds its
// own enable from an expression. The old constant-only evaluator could resolve neither.
module gated_blk(input logic ck, input logic scan_mode, input logic func_en, output logic gq);
  logic te_in;
  assign te_in = scan_mode & ~1'b0;        // needs a BINARY op + a hierarchy hop to resolve
  my_icg u_icg(.CK(ck), .FE(1'b0), .TE(te_in), .GCK(gq));
endmodule

// Enable produced by a CHILD instance's output — resolving it means descending into the child.
module en_src(output logic o);
  assign o = 1'b1;
endmodule

module top(input logic clk_a, clk_b, sel_unknown, d,
           output logic q0, q1, qx, qm, qmx, qh, qc, qd);
  logic g1, g2, gi, gx, m1, mx;
  logic te_on, en_off, sel_on;
  assign te_on  = 1'b1;
  assign en_off = 1'b0;
  assign sel_on = 1'b1;

  // (f) enable through a port + a binary expression -> the gate MUST open
  logic scan_mode_top, gh;
  assign scan_mode_top = 1'b1;
  gated_blk u_blk(.ck(clk_a), .scan_mode(scan_mode_top), .func_en(1'b0), .gq(gh));
  always_ff @(posedge gh) qh <= d;

  // (g) enable driven by a child instance's output -> resolving it means descending
  logic en_from_child, gc;
  en_src u_ensrc(.o(en_from_child));
  my_icg u_icgC(.CK(clk_a), .FE(en_off), .TE(en_from_child), .GCK(gc));
  always_ff @(posedge gc) qc <= d;

  // (h) CONTROLLING VALUE: `unknown & 0` is 0 whatever the unknown is -> gate stays CLOSED,
  //     and `unknown | 1` is 1 -> that gate OPENS. Neither is a literal.
  logic dom_zero, dom_one, gd;
  assign dom_zero = sel_unknown & 1'b0;
  assign dom_one  = sel_unknown | 1'b1;
  my_icg u_icgD(.CK(clk_a), .FE(dom_zero), .TE(dom_one), .GCK(gd));
  always_ff @(posedge gd) qd <= d;

  my_icg  u_icg1(.CK(clk_a), .FE(en_off), .TE(te_on),  .GCK(g1));
  my_icg  u_icg2(.CK(g1),    .FE(en_off), .TE(te_on),  .GCK(g2));
  my_cinv u_cinv(.CK(g2),                              .GCK(gi));
  my_icg  u_icgX(.CK(clk_a), .FE(en_off), .TE(en_off), .GCK(gx));   // gate held closed
  my_cmux u_mux (.A0(clk_b), .A1(clk_a), .S0(sel_on),      .Y(m1)); // sel=1 -> A1 = clk_a
  my_cmux u_muxX(.A0(clk_b), .A1(clk_a), .S0(sel_unknown), .Y(mx)); // sel unknown

  always_ff @(posedge g2) q0  <= d;
  always_ff @(posedge gi) q1  <= d;
  always_ff @(posedge gx) qx  <= d;
  always_ff @(posedge m1) qm  <= d;
  always_ff @(posedge mx) qmx <= d;
endmodule
