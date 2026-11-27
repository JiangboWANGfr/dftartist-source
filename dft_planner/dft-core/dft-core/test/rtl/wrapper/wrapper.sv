// Ground truth for the wrapper-cell estimator: one boundary port per rule it has to get right.
// The expected decision for each port is in the comment next to it; test_wrapper.cpp asserts them.
module wrap_top (
    input  wire       clk,        // clock          -> none
    input  wire       rst_n,      // async reset    -> none
    input  wire       test_mode,  // caller-excluded-> none
    input  wire       d_direct,   // 1 flop         -> shared
    input  wire       d_gate,     // 1 flop, gated  -> shared
    input  wire [3:0] d_bus,      // 1 flop per BIT -> shared (this is the bit-precision case)
    input  wire       d_dead,     // ANDed with 0   -> none, reaches nothing
    input  wire       d_wide,     // 6 flops        -> dedicated, over the threshold
    input  wire       d_thru,     // no flop at all -> dedicated
    input  wire       d_acc,      // accumulator    -> shared, but all 4 cells are FEEDBACK

    output wire       q_acc,      // accumulator Q  -> shared, 1 cell, 1 of them feedback
    output wire       q_direct,   // flop Q         -> shared
    output wire       q_inv,      // ~flop Q        -> shared
    output wire [3:0] q_bus,      // 1 flop per BIT -> shared
    output wire       q_const,    // tied 1         -> none
    output wire       q_thru,     // combinational  -> dedicated
    output wire       q_deep      // flop in a CHILD-> shared
);
    localparam DEAD = 1'b0;

    reg       r_direct, r_gate, r_dead_sink;
    reg [3:0] r_bus, r_acc;
    reg [5:0] r_wide;

    // Its own output comes back round to its own D — a wrapper cell cannot place it in one
    // shift, so every cell identified here is an internal-feedback cell.
    always @(posedge clk or negedge rst_n)
      if (!rst_n) r_acc <= 4'b0;
      else        r_acc <= r_acc + {3'b0, d_acc};
    assign q_acc = r_acc[0];

    always @(posedge clk or negedge rst_n)
      if (!rst_n) r_direct <= 1'b0;
      else        r_direct <= d_direct;

    always @(posedge clk or negedge rst_n)
      if (!rst_n) r_gate <= 1'b0;
      else        r_gate <= d_gate & test_mode;

    always @(posedge clk or negedge rst_n)
      if (!rst_n) r_bus <= 4'b0;
      else        r_bus <= d_bus;

    // One input landing on six flops: past the 4-flop threshold, so it needs its own cell.
    always @(posedge clk or negedge rst_n)
      if (!rst_n) r_wide <= 6'b0;
      else        r_wide <= {6{d_wide}};

    // A controlling constant on the way to the only load: the port drives nothing at all.
    wire dead_int = d_dead & DEAD;
    always @(posedge clk or negedge rst_n)
      if (!rst_n) r_dead_sink <= 1'b0;
      else        r_dead_sink <= dead_int;

    assign q_direct = r_direct;
    assign q_inv    = ~r_gate;
    assign q_bus    = r_bus;
    assign q_const  = 1'b1;
    assign q_thru   = d_thru;

    wrap_leaf u_leaf (.clk(clk), .rst_n(rst_n), .a(r_wide[0]), .y(q_deep));
endmodule

module wrap_leaf (
    input  wire clk,
    input  wire rst_n,
    input  wire a,
    output wire y
);
    reg r;
    always @(posedge clk or negedge rst_n)
      if (!rst_n) r <= 1'b0;
      else        r <= a;
    assign y = r;
endmodule
