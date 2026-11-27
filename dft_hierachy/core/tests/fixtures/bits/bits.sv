// Fixture for verification items V2, V4, V6: what bit ranges slang reports for writes
// and reads across the type and expression forms the model must represent.
typedef struct packed { logic [3:0] hi; logic [3:0] lo; } pk_t;   // 8 bits, hi = [7:4]
typedef struct { logic [3:0] a; logic [7:0] b; } unpk_t;          // unpacked

module child(input logic [3:0] d, output logic [3:0] q);
  logic poke;
  assign q = d;
endmodule

module top(input logic clk, input logic rst_n, input logic sel,
           input logic [7:0] a, input logic [7:0] b, input logic [1:0] idx);
  // --- declared ranges ---
  logic [15:8] up;        // descending, not starting at 0
  logic [0:7]  rev;       // ascending
  assign up[11:8] = a[3:0];
  assign rev[0:3] = a[7:4];          // rev[0] is the MSB

  // --- part selects, indexed part selects, concatenation on the left ---
  logic [7:0] ps;
  assign ps[7:4]  = a[3:0];
  assign ps[0+:2] = b[1:0];
  assign {ps[3], ps[2]} = b[7:6];

  // --- packed struct, unpacked struct, unpacked array, memory ---
  pk_t   pk;
  unpk_t un;
  logic [3:0] arr [0:2];             // 3 elements of 4 bits
  logic [7:0] mem [4];
  assign pk.lo = a[3:0];
  assign un.b  = b;
  assign arr[1] = a[3:0];
  assign arr[2][3:2] = b[1:0];

  // --- dynamic index: not statically known ---
  logic [7:0] dyn;
  always_comb begin
    dyn = '0;
    dyn[idx] = a[0];
  end
  always_ff @(posedge clk) mem[idx] <= a;

  // --- selector written both ways ---
  logic mux_assign, mux_proc;
  assign mux_assign = sel ? a[0] : b[0];
  always_comb begin
    if (sel) mux_proc = a[0];
    else     mux_proc = b[0];
  end

  // --- register with async reset; multiple drivers on one net; initializer ---
  logic [3:0] r;
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) r <= '0;
    else        r <= a[3:0] + b[3:0];
  wire multi;
  assign multi = a[0];
  assign multi = b[0];
  wire init_net = a[1] & b[1];

  // --- child instances; a hierarchical assignment into one of them (V4) ---
  logic [3:0] q0, q1;
  child c0(.d(a[3:0]), .q(q0));
  child c1(.d({a[1:0], b[1:0]}), .q(q1));
  assign c1.poke = sel;
  logic peek;
  assign peek = c0.poke;             // hierarchical read
endmodule
