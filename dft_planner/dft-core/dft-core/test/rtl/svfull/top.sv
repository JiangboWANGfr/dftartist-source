// Kitchen-sink SystemVerilog, part 3/3: the hardware side — UDPs, gate primitives, specify
// blocks, generate, instance arrays, every procedural form, assertions, bind, and the
// Verilog-95 constructs an old vendor library still ships.
`timescale 1ns / 1ps
`define DW 8
`define MAX(a, b) ((a) > (b) ? (a) : (b))

// --- user-defined primitive (sequential + combinational tables) ---------------------------
primitive udp_mux(out, sel, a, b);
  output out;
  input  sel, a, b;
  table
    // sel a b : out
    0 1 ? : 1;
    0 0 ? : 0;
    1 ? 1 : 1;
    1 ? 0 : 0;
    x 0 0 : 0;
    x 1 1 : 1;
  endtable
endprimitive

// --- Verilog-1995 style port list + specify block (a vendor cell model) -------------------
`celldefine
module cell_dff(q, d, ck);
  output q;
  input  d, ck;
  reg    q;
  always @(posedge ck) q <= d;
  specify
    (posedge ck => (q +: d)) = (0.1, 0.1);
    $setup(d, posedge ck, 0.05);
    $hold(posedge ck, d, 0.05);
  endspecify
endmodule
`endcelldefine

module leaf #(
    parameter int W = 8
) (
    input  logic         clk,
    input  logic         rst_n,
    input  logic [W-1:0] d,
    output logic [W-1:0] q
);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q <= '0;
    else q <= d;
endmodule

module sv_full_top
  import dft_pkg::*;
#(
    parameter int  N    = 4,
    parameter type DATA_T = logic [`DW-1:0]
) (
    input  logic            clk,
    input  logic            rst_n,
    input  logic            se,
    input  logic [`DW-1:0]  din,
    output logic [`DW-1:0]  dout,
    inout  wire             pad
);
  // --- nets & vars of every flavour -------------------------------------------------------
  wire  [`DW-1:0] w_and, w_or;
  tri            t_bus;
  wand           wa;
  logic [`DW-1:0] pipe   [N];        // unpacked array of packed
  DATA_T          shadow;
  state_e         st;
  bus_t           bus;
  nib_q_t         nibs;
  map_t           counts;
  maybe_int_t     mi;

  scan_if #(.W(`DW)) intf (.clk(clk));

  // --- continuous assigns: concat, replication, streaming, inside, casting ----------------
  assign w_and  = din & {`DW{se}};
  assign w_or   = {din[3:0], din[7:4]};
  assign dout   = st == CAPTURE ? shadow : pipe[0];
  assign t_bus  = se ? 1'b1 : 1'bz;
  assign wa     = se;
  assign pad    = se ? shadow[0] : 1'bz;

  let is_shift(s) = (s == SHIFT);

  // --- gate primitives, UDP, instance array -----------------------------------------------
  and       u_and (w_and[0], din[0], se);
  nand #(2) u_nand (w_or[0], din[1], se);
  bufif1    u_bufif (t_bus, din[2], se);
  pmos      u_pmos (t_bus, din[3], se);
  tranif0   u_tran (t_bus, wa, se);
  udp_mux   u_udp (w_and[1], se, din[4], din[5]);
  cell_dff  u_cell (.q(w_or[1]), .d(din[6]), .ck(clk));

  leaf #(.W(`DW)) u_arr[N-1:0] (
      .clk(clk), .rst_n(rst_n), .d(din), .q()
  );

  // --- generate: for / if / case, with labels ----------------------------------------------
  genvar gi;
  generate
    for (gi = 0; gi < N; gi++) begin : g_stage
      if (gi == 0) begin : g_first
        always_ff @(posedge clk) pipe[gi] <= din;
      end else begin : g_rest
        always_ff @(posedge clk) pipe[gi] <= pipe[gi-1];
      end
    end

    case (N)
      1: begin : g_one
        assign shadow = pipe[0];
      end
      default: begin : g_many
        assign shadow = pipe[N-1];
      end
    endcase
  endgenerate

  // --- procedural blocks: every kind --------------------------------------------------------
  always_comb begin
    unique case (st)
      IDLE:    bus = '{addr: 8'h00, data: din};
      SHIFT:   bus = '{addr: 8'h01, data: {din[6:0], se}};
      CAPTURE: bus = '{default: '0};
      default: bus = '{default: 'x};
    endcase
  end

  always_comb begin
    priority casez (din)
      8'b1???_????: counts["hi"] = 1;
      8'b0???_????: counts["lo"] = 1;
      default:      counts["na"] = 1;
    endcase
    if (din inside {[8'h00 : 8'h0f], 8'hff}) counts["edge"] = 1;
  end

  logic lat;
  always_latch if (se) lat <= din[0];

  always @* if (rst_n) nibs = {din[3:0]};

  always @(posedge clk iff rst_n) st <= is_shift(st) ? CAPTURE : SHIFT;

  initial begin : b_init
    automatic int seed = 0;
    fork
      begin
        #1 seed = dft_hash(7);
      end
      #2 dft_seed(seed);
    join_none
    wait fork;
  end

  final $display("done %0d", dft_pkg::base_item#(8)::count);

  // --- tasks / functions: ref, default args, void'() ----------------------------------------
  function automatic int add(input int a, input int b = 1);
    return a + b;
  endfunction

  task automatic bump(ref int v, input int by = 1);
    v += by;
  endtask

  int acc;
  always_ff @(posedge clk) begin
    int tmp;
    tmp = add(acc);
    bump(tmp, 2);
    acc <= tmp;
    void'(add(1, 2));
  end

  // --- foreach over unpacked / associative, array methods -----------------------------------
  int total;
  always_comb begin
    total = 0;
    foreach (pipe[i]) total += pipe[i];
    foreach (counts[k]) total += counts[k];
    total += sum_q(nibs);
  end

  // --- tagged union pattern matching ---------------------------------------------------------
  int mi_val;
  always_comb begin
    mi = tagged Valid (32'd7);
    case (mi) matches
      tagged Invalid: mi_val = 0;
      tagged Valid .v: mi_val = v;
    endcase
  end

  // --- streaming operators + $cast ------------------------------------------------------------
  logic [`DW-1:0] streamed;
  state_e         casted;
  always_comb begin
    streamed = {<<4{din}};
    if (!$cast(casted, din[1:0])) casted = IDLE;
  end

  // --- concurrent assertions in a module -------------------------------------------------------
  property p_reset_clears;
    @(posedge clk) disable iff (!rst_n) $fell(rst_n) |=> (dout == '0);
  endproperty
  a_reset: assert property (p_reset_clears)
  else $error("reset did not clear");
  m_din: assume property (@(posedge clk) !$isunknown(din));
  c_shift: cover property (@(posedge clk) st == SHIFT ##1 st == CAPTURE);
  // NOTE: unlabeled on purpose — slang rejects `label: restrict property`, which the LRM allows.
  restrict property (@(posedge clk) !$isunknown(se));

  sequence s_pulse;
    se ##[1:$] !se;
  endsequence
  a_pulse: assert property (@(posedge clk) se |-> s_pulse.triggered or 1'b1);

  // immediate + deferred assertions
  always_comb begin
    assert (N > 0)
    else $fatal(1, "bad N");
    assert #0 (`MAX(N, 1) >= 1);
  end

endmodule

// --- bind: attach a checker to every leaf instance without touching it ----------------------
bind leaf chk_no_x u_chk (.clk(clk), .sig(q[0]));
