// clock/reset-tree fixture:
//   clk_a: constrained (create_clock) -> buffered  -> flop u_core.r0        => 010
//   clk_a inverted                    -> flop u_core.r1                     => 101
//   clk_free: NOT constrained         -> flop u_core.r2                     => root Z, value X
//   gated clock through an AND gate   -> flop u_core.r3                     => logic, X
//   clock from a cell (clkgate box)   -> flop u_top.r4                      => instance, X
//   rst_n: active-low reset, constrained 1 by set_case_analysis -> ok (inactive=1)
//   rst_free: active-high reset, unconstrained                  -> X, NOT ok (inactive=0)
module clkgate(input logic ck, input logic en, output logic gck);
  assign gck = ck & en;   // stands in for a clock-gating cell
endmodule

module core(
    input logic ck_buf, ck_inv, ck_free, ck_gated,
    input logic rst_n, rst_free,
    input logic d,
    output logic q0, q1, q2, q3, q_r
);
  always_ff @(posedge ck_buf) q0 <= d;                  // r0
  always_ff @(negedge ck_inv) q1 <= d;                  // r1
  always_ff @(posedge ck_free) q2 <= d;                 // r2
  always_ff @(posedge ck_gated) q3 <= d;                // r3
  always_ff @(posedge ck_buf or negedge rst_n) begin    // reset via rst_n (active low)
    if (!rst_n) q_r <= 1'b0;
    else        q_r <= d;
  end
endmodule

module top(
    input logic clk_a, clk_free, en, d,
    input logic rst_n, rst_free,
    output logic q0, q1, q2, q3, q4, q_r, q_rf
);
  logic clk_buf1, clk_buf2, clk_n, clk_and, gck;

  assign clk_buf1 = clk_a;        // buffer chain: clk_a -> buf1 -> buf2
  assign clk_buf2 = clk_buf1;
  assign clk_n    = ~clk_a;       // inverter
  assign clk_and  = clk_a & en;   // real gate: NOT see-through

  clkgate u_cg(.ck(clk_a), .en(en), .gck(gck));

  core u_core(.ck_buf(clk_buf2), .ck_inv(clk_n), .ck_free(clk_free), .ck_gated(clk_and),
              .rst_n(rst_n), .rst_free(rst_free), .d(d),
              .q0(q0), .q1(q1), .q2(q2), .q3(q3), .q_r(q_r));

  always_ff @(posedge gck) q4 <= d;                     // r4: clock from a cell output
  always_ff @(posedge clk_a or posedge rst_free)        // reset active high, unconstrained
    if (rst_free) q_rf <= 1'b0;
    else          q_rf <= d;
endmodule
