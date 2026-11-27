// Register-count fixture: one top instantiating the counting corner cases.
module leaf_ff(input clk, input [31:0] d, output logic [31:0] q);
  always_ff @(posedge clk) q <= d;                 // own = 32
endmodule

module comb_only(input a, output logic y);
  always @(*) y = a;                               // own = 0 (combinational)
endmodule

module dedup_ff(input clk, input rst, input [7:0] d, output logic [7:0] q);
  always_ff @(posedge clk) q <= d;                 // q here ...
  always_ff @(posedge clk) if (rst) q <= 8'h0;     // ... and here -> dedup -> 8
endmodule

module mem_blk(input clk, input [7:0] wd, input [7:0] a);
  logic [7:0] mem [0:255];
  always_ff @(posedge clk) mem[a] <= wd;           // own = 0, memoryBits = 8*256 = 2048
endmodule

module incr_ff(input clk, output logic [3:0] cnt);
  always_ff @(posedge clk) cnt++;                  // own = 4  (exercises Bug 2)
endmodule

module struct_ff(input clk);
  typedef struct packed { logic [3:0] a; logic [3:0] b; } pair_t;
  pair_t x, y, z;
  always_ff @(posedge clk) x.a    <= 4'd1;         // base var x -> full 8
  always_ff @(posedge clk) y.a    <= 4'd2;         // base var y -> full 8
  always_ff @(posedge clk) z.a[1] <= 1'b1;         // select-of-member -> base z -> full 8; own = 24
endmodule

module top(input clk, input rst, input [31:0] d);
  logic [31:0] q1; logic [7:0] q2; logic yy; logic [3:0] cnt;
  logic [3:0] cnt2;
  leaf_ff   u_leaf  (.clk(clk), .d(d),        .q(q1));
  comb_only u_comb  (.a(rst),                 .y(yy));
  dedup_ff  u_dedup (.clk(clk), .rst(rst), .d(d[7:0]), .q(q2));
  mem_blk   u_mem   (.clk(clk), .wd(d[7:0]), .a(d[7:0]));
  incr_ff   u_incr   (.clk(clk), .cnt(cnt2));
  struct_ff u_struct (.clk(clk));
  always_ff @(posedge clk) cnt <= cnt + 4'd1;      // top own = 4
endmodule
