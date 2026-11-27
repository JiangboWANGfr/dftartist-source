// P2 fixture: every primitive shape the decomposer must infer.
module dut(
    input  logic        clk,
    input  logic        rst_n,
    input  logic        sel,
    input  logic [3:0]  a,
    input  logic [3:0]  b,
    input  logic [1:0]  st,
    output logic [3:0]  y_and,     // assign + gate
    output logic [3:0]  y_mux,     // assign + ?: -> MUX
    output logic        y_cmp,     // assign + == -> eq
    output logic [3:0]  q,         // always_ff + async reset -> DFFR
    output logic [3:0]  q_noreset, // always_ff, no reset -> DFF
    output logic [3:0]  c_out,     // always_comb + if/else -> MUX
    output logic [3:0]  case_out,  // always_comb + case -> mux chain
    output logic [1:0]  y_slice,   // constant bit-select -> folded into the signal name
    output logic        y_dyn      // variable index -> stays a select cell
);
  // gate: & of two buses
  assign y_and = a & b;

  // ternary -> MUX(s=sel, a, b)
  assign y_mux = sel ? a : b;

  // comparator -> eq
  assign y_cmp = (a == b);

  // async-reset flop: reset value 4'h0, next state a+b
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) q <= 4'h0;
    else        q <= a + b;
  end

  // plain flop, no reset
  always_ff @(posedge clk) q_noreset <= a ^ b;

  // if/else -> MUX
  always_comb begin
    if (sel) c_out = a;
    else     c_out = b;
  end

  // constant bit-select: must fold into the signal NAME (a[2:1]), not become a cell
  assign y_slice = a[2:1] | b[2:1];
  // variable index IS hardware (a mux) -> must stay a select cell
  assign y_dyn = a[st];

  // case -> chain of MUXes with eq comparators
  always_comb begin
    case (st)
      2'd0: case_out = a;
      2'd1: case_out = b;
      2'd2: case_out = a | b;
      default: case_out = 4'h0;
    endcase
  end
endmodule

module top(
    input  logic clk, rst_n, sel,
    input  logic [3:0] a, b,
    input  logic [1:0] st,
    output logic [3:0] y_and, y_mux, q, q_noreset, c_out, case_out,
    output logic [1:0] y_slice,
    output logic y_cmp, y_dyn
);
  dut u_dut(.clk(clk), .rst_n(rst_n), .sel(sel), .a(a), .b(b), .st(st),
            .y_and(y_and), .y_mux(y_mux), .y_cmp(y_cmp), .q(q),
            .q_noreset(q_noreset), .c_out(c_out), .case_out(case_out),
            .y_slice(y_slice), .y_dyn(y_dyn));
endmodule
