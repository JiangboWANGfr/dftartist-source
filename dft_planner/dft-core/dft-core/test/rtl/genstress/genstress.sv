// Elaboration stress: the two shapes that break a frontend's default capacity limits, plus a
// generate nest gnarly enough that getting the flop count right actually proves something.
//
//   DEPTH  = recursion depth  -> slang's maxInstanceDepth (default 128)
//   ARRAY  = instance array N -> slang's maxInstanceArray (default 65535)
//
// Both defaults are below what a generated SoC reaches, so this file simply fails to elaborate
// on a stock slang configuration. Sizes are parameters so the same file serves the unit test
// (fast) and a scaling sweep (large).

// ---------------------------------------------------------------------------- leaf cell
module cell_buf (
    input  logic a,
    output logic z
);
  assign z = a;
endmodule

// ------------------------------------------------- linear recursion: hierarchy depth == N
// Each level instantiates the next, so the elaborated hierarchy is N instances deep. This is
// what a recursively-generated pipeline / CRC tree looks like, and it is the construct that
// hits maxInstanceDepth.
module delay_chain #(
    parameter int N = 4
) (
    input  logic clk,
    input  logic d,
    output logic q
);
  if (N <= 1) begin : g_last
    always_ff @(posedge clk) q <= d;
  end else begin : g_rec
    logic mid;
    always_ff @(posedge clk) mid <= d;
    delay_chain #(.N(N - 1)) u_next (.clk(clk), .d(mid), .q(q));
  end
endmodule

// ------------------------------------------- recursive BINARY split: depth log2(N), width N
// Different recursion shape from the chain: two children per level, so the instance count grows
// while the depth stays small. Catches subtree-accounting bugs a linear chain cannot.
module reduce_tree #(
    parameter int N = 8
) (
    input  logic [N-1:0] d,
    output logic         z
);
  if (N == 1) begin : g_leaf
    assign z = d[0];
  end else begin : g_split
    localparam int H = N / 2;
    logic zl, zr;
    reduce_tree #(.N(H))     u_lo (.d(d[H-1:0]), .z(zl));
    reduce_tree #(.N(N - H)) u_hi (.d(d[N-1:H]), .z(zr));
    assign z = zl & zr;
  end
endmodule

// ------------------------------------------------------- huge instance array (one statement)
// `cell_buf u_cell [N-1:0] (...)` — a single line that elaborates to N instances. Real gate
// netlists emit these for bus repeaters and clock spines.
module huge_array #(
    parameter int N = 70000
) (
    input  logic [N-1:0] a,
    output logic [N-1:0] z
);
  cell_buf u_cell[N-1:0] (
      .a(a),
      .z(z)
  );
endmodule

// ------------------------------------------ 3-level generate nest: for x for x case x if
// Every arm drives a DIFFERENT bit of the same vector from its own always_ff, so the flop count
// is exactly R*C and any double-counting or missed generate arm shows up immediately.
module gen_matrix #(
    parameter int R = 8,
    parameter int C = 8
) (
    input  logic           clk,
    input  logic [R*C-1:0] d,
    output logic [R*C-1:0] q
);
  genvar i, j;
  for (i = 0; i < R; i++) begin : g_row
    for (j = 0; j < C; j++) begin : g_col
      localparam int IDX = i * C + j;
      case (IDX % 3)
        0: begin : g_same
          always_ff @(posedge clk) q[IDX] <= d[IDX];
        end
        1: begin : g_inv
          always_ff @(posedge clk) q[IDX] <= ~d[IDX];
        end
        default: begin : g_mix
          if (IDX > 0) begin : g_dep
            always_ff @(posedge clk) q[IDX] <= d[IDX-1];
          end else begin : g_zero
            always_ff @(posedge clk) q[IDX] <= 1'b0;
          end
        end
      endcase
    end
  end
endmodule

// -------------------------------------------------------------------------------- the top
module genstress_top #(
    parameter int DEPTH = 300,   // > slang's default maxInstanceDepth of 128
    parameter int ARRAY = 70000, // > slang's default maxInstanceArray of 65535
    parameter int ROWS  = 8,
    parameter int COLS  = 8,
    parameter int TREE  = 64
) (
    input  logic                clk,
    input  logic                din,
    input  logic [ARRAY-1:0]    abus,
    input  logic [ROWS*COLS-1:0] mdin,
    output logic                dq,
    output logic [ARRAY-1:0]    abus_o,
    output logic [ROWS*COLS-1:0] mq,
    output logic                tz
);
  delay_chain #(.N(DEPTH)) u_chain (.clk(clk), .d(din), .q(dq));
  huge_array  #(.N(ARRAY)) u_array (.a(abus), .z(abus_o));
  gen_matrix  #(.R(ROWS), .C(COLS)) u_matrix (.clk(clk), .d(mdin), .q(mq));
  reduce_tree #(.N(TREE)) u_tree (.d(mdin[TREE-1:0]), .z(tz));
endmodule
