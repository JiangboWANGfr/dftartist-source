// M2 acceptance fixtures (docs/DESIGN.md 10, "M2 的进入门槛"; A01-A03, A05, A06, A11).
// Written from the design document alone. Each module below is opened as its own top
// (--top NAME); the expected results are written by hand in core/tests/m2/test_*.py.

// ---- net declaration initializers as drivers ------------------------------------
module init(input logic [3:0] a, b, output wire [3:0] o);
  wire       x = a[0] & b[0];           // one driver: the initializer
  wire [3:0] w = {a[1:0], b[3:2]};      // initializer with part selects
  wire       two = a[1];                // an initializer ...
  assign     two = b[1];                // ... and an assign: two drivers
  assign o = {two, x, w[1:0]};
endmodule

// ---- per-bit correspondence and roles -------------------------------------------
module lhs_concat(input logic [3:0] a, output logic [1:0] hi, lo);
  assign {hi, lo} = a;
endmodule

module nested(input logic [1:0] a, b, c, m, input logic en, k, output logic [1:0] y);
  always_comb begin
    y = a;
    if (en) begin
      case (m)
        2'd0:    y = b;
        default: ;
      endcase
    end
    if (k) y[0] = c[1];                 // writes y[0] only: k is no condition of y[1]
  end
endmodule

module ff(input logic clk, rst_n, input logic [1:0] d, output logic [1:0] q);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q <= '0;
    else        q <= d;
endmodule

// ---- port connection expressions ------------------------------------------------
module leaf(input logic [3:0] d, input logic en, output logic [3:0] q, output logic z);
  assign q = d;
  assign z = en;
endmodule

module pins(input logic [7:0] bus, input logic [3:0] a, b, input logic s,
            input logic [15:8] up, input logic [0:7] rev, output logic [7:0] o);
  logic [3:0] q0, q2, q3, q4, q5, q6, q7, q8, q9, q10, q11;
  logic       z0, z3, z4, z6, z7, z8, z9, z10, z11;
  leaf u_direct (.d(a),                      .en(s),      .q(q0),             .z(z0));
  leaf u_slice  (.d(bus[7:4]),               .en(bus[0]), .q(o[3:0]),         .z(o[4]));
  leaf u_concat (.d({a[1:0], b[3:2]}),       .en(1'b1),   .q({o[5], q2[2:0]}), .z());
  leaf u_const  (.d(4'b10xz),                .en(1'b0),   .q(q3),             .z(z3));
  leaf u_expr   (.d(a & b),                  .en(~s),     .q(q4),             .z(z4));
  leaf u_open   (.d(),                       .en(s),      .q(),               .z(o[6]));
  leaf u_idx    (.d(bus[2 +: 4]),            .en(s),      .q(q5),             .z(o[7]));
  leaf u_rev    (.d({a[0], a[1], a[2], a[3]}), .en(s),    .q(q6),             .z(z6));
  leaf u_narrow (.d(a[1:0]),                 .en(s),      .q(q7),             .z(z7));
  leaf u_rng    (.d(up[11:8]),               .en(s),      .q(q8),             .z(z8));
  leaf u_asc    (.d(rev[0:3]),               .en(s),      .q(q9),             .z(z9));
  leaf u_rep    (.d({2{a[1:0]}}),            .en(s),      .q(q10),            .z(z10));
  leaf u_sext   (.d($signed(a[1:0])),        .en(s),      .q(q11),            .z(z11));
endmodule

// ---- occurrences: one module, several instances, an instance array ---------------
module ocell(input logic clk, input logic [1:0] d, output logic [1:0] q);
  logic [1:0] n;
  logic       ck;
  assign n  = ~d;
  assign q  = n;
  assign ck = clk;
endmodule

module occ(input logic clk_a, clk_b, input logic [1:0] da, db, d0, d1,
           output logic [1:0] qa, qb, output logic [3:0] qarr);
  ocell u_a (.clk(clk_a), .d(da), .q(qa));
  ocell u_b (.clk(clk_b), .d(db), .q(qb));
  ocell u_arr [1:0] (.clk(clk_a), .d({d1, d0}), .q(qarr));  // u_arr[1] gets d1, qarr[3:2]
endmodule

// ---- real multiple drivers and conditional tri-state drivers ---------------------
module multi(input logic a, b, en1, en2, output wire m, output tri t);
  assign m = a;
  assign m = b;
  assign t = en1 ? a : 1'bz;
  assign t = en2 ? b : 1'bz;
endmodule

// ---- three levels, an internal alias, fan-out -----------------------------------
module l3(input logic [1:0] i, output logic [1:0] o);
  logic [1:0] alias_w;
  assign alias_w = i;
  assign o = alias_w;
endmodule

module l2(input logic [1:0] i, output logic [1:0] o);
  l3 u3 (.i(i), .o(o));
endmodule

module sink(input logic d);
  logic r;
  assign r = d;
endmodule

module xhier(input logic [3:0] in, output logic [1:0] out);
  logic [1:0] mid;
  l2 u2 (.i(in[2:1]), .o(mid));
  assign out = mid;
  sink s0 (.d(mid[0]));
  sink s1 (.d(mid[0]));
  sink s2 (.d(mid[1]));
endmodule

// ---- sequential elements (docs/DESIGN.md 4.6) -----------------------------------
module seq(input logic clk, clk2, rst_n, set, input logic [3:0] d,
           output logic [3:0] q, output logic s, p, p2, c);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q <= '0;
    else        q <= d;
  always @(negedge clk2 or posedge set)
    if (set) s <= 1'b1;
    else     s <= d[0];
  always_ff @(posedge clk) begin        // one block, two variables: two registers
    p  <= d[1];
    p2 <= d[3];
  end
  always_comb c = d[2];                 // not a register
endmodule
