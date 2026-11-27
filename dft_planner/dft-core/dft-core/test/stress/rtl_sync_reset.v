// Minimal reproducer, self-written: the classic reset-synchroniser shape.
//   * ANSI-less port list (names first, directions declared in the body) — same as the design
//   * output driven by `assign <out> = <reg>[bit];`  (a BIT-SELECT)
//   * that reg driven by an edge-triggered always with an async reset
// The question this isolates: does the walk report the flop, or does it dead-end?
module sync_reset (
    rst_s,
    clk,
    rst_a
);
output       rst_s;
input        clk;
input        rst_a;

reg  [1:0] data_sync;

always @(posedge clk or posedge rst_a)
  if (rst_a) data_sync <= 2'b11;
  else       data_sync <= {data_sync[0], 1'b0};

assign rst_s = data_sync[1];

endmodule

// A second copy instantiated twice, so the "AnalysisManager keeps drivers for ONE
// representative body" path is exercised as well as the single-instance path.
module blk (input wire clk, input wire rst_a, input wire d, output reg q);
  wire rst_s;
  sync_reset u_sync(.rst_s(rst_s), .clk(clk), .rst_a(rst_a));
  always @(posedge clk or posedge rst_s)
    if (rst_s) q <= 1'b0;
    else       q <= d;
endmodule

module top (input wire clk, input wire rst_a, input wire d,
            output wire q0, output wire q1);
  blk u_b0(.clk(clk), .rst_a(rst_a), .d(d), .q(q0));
  blk u_b1(.clk(clk), .rst_a(rst_a), .d(d), .q(q1));
endmodule
