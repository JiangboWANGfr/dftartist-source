module generation_chain(input logic clk, rst, d, output logic q);
  logic first, second;
  always_ff @(posedge clk or negedge rst) if (!rst) first <= 0; else first <= d;
  always_ff @(posedge first or negedge rst) if (!rst) second <= 0; else second <= d;
  cell_ff u(second,rst,d,q);
endmodule
module generation_pair(input logic a, b, rst, d, output logic [1:0] q);
  cell_ff a_sink(a,rst,d,q[0]); cell_ff b_sink(b,rst,d,q[1]);
endmodule
module generation_shared(input logic clk, rst, d, output logic [1:0] q);
  logic [1:0] divided;
  always_ff @(posedge clk or negedge rst) if (!rst) divided <= 0; else divided <= {d,~d};
  generation_pair sinks(divided[0],divided[1],rst,d,q);
endmodule
module generation_mode(input logic clk, rst, sel, d, output logic q);
  logic first, second;
  wire chosen;
  always_ff @(posedge clk) first <= d;
  assign chosen = sel ? clk : first;
  always_ff @(posedge chosen) second <= d;
  cell_ff u(second,rst,d,q);
endmodule
module generation_self(input logic d, output logic q);
  always_ff @(posedge q) q <= d;
endmodule
module generation_cycles(input logic d, output logic [3:0] q);
  always_ff @(posedge q[1]) q[0] <= d;
  always_ff @(posedge q[0]) q[1] <= d;
  always_ff @(posedge q[3]) q[2] <= d;
  always_ff @(posedge q[2]) q[3] <= d;
endmodule
module generation_unknown(input logic clk, rst, en, d, output logic q);
  logic gated, first;
  always_comb gated = clk & en;
  always_ff @(posedge gated) first <= d;
  cell_ff u(first,rst,d,q);
endmodule
module generation_paged(input logic clk, rst, d, output logic [1:0] q);
  logic r0,r1,r2,r3,r4,r5,r6,r7,r8,r9,r10,r11,r12,r13,r14,r15,r16,r17,r18,r19,r20,r21,r22,r23,r24,r25,r26,r27,r28,r29,r30,r31,r32,r33,r34,r35,r36,r37,r38,r39,r40,r41,r42,r43,r44,r45,r46,r47,r48,r49,r50,r51,r52,r53,r54,r55,r56,r57,r58,r59,r60,r61,r62,r63,r64,r65,r66,r67,r68,r69;
  always_ff @(posedge clk) begin
    r0 <= d;
    r1 <= d;
    r2 <= d;
    r3 <= d;
    r4 <= d;
    r5 <= d;
    r6 <= d;
    r7 <= d;
    r8 <= d;
    r9 <= d;
    r10 <= d;
    r11 <= d;
    r12 <= d;
    r13 <= d;
    r14 <= d;
    r15 <= d;
    r16 <= d;
    r17 <= d;
    r18 <= d;
    r19 <= d;
    r20 <= d;
    r21 <= d;
    r22 <= d;
    r23 <= d;
    r24 <= d;
    r25 <= d;
    r26 <= d;
    r27 <= d;
    r28 <= d;
    r29 <= d;
    r30 <= d;
    r31 <= d;
    r32 <= d;
    r33 <= d;
    r34 <= d;
    r35 <= d;
    r36 <= d;
    r37 <= d;
    r38 <= d;
    r39 <= d;
    r40 <= d;
    r41 <= d;
    r42 <= d;
    r43 <= d;
    r44 <= d;
    r45 <= d;
    r46 <= d;
    r47 <= d;
    r48 <= d;
    r49 <= d;
    r50 <= d;
    r51 <= d;
    r52 <= d;
    r53 <= d;
    r54 <= d;
    r55 <= d;
    r56 <= d;
    r57 <= d;
    r58 <= d;
    r59 <= d;
    r60 <= d;
    r61 <= d;
    r62 <= d;
    r63 <= d;
    r64 <= d;
    r65 <= d;
    r66 <= d;
    r67 <= d;
    r68 <= d;
    r69 <= d;
  end
  generation_pair sinks(r68,r69,rst,d,q);
endmodule
module generation_fanout(input logic clk, rst, d, output logic [1:0] q);
  logic divided;
  always_ff @(posedge clk or negedge rst) if (!rst) divided <= 0; else divided <= d;
  generation_pair sinks(divided,divided,rst,d,q);
endmodule
