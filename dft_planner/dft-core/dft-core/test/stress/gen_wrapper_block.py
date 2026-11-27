#!/usr/bin/env python3
"""Generate a BLOCK-sized wrapper-analysis stress design: millions of register bits behind a
wide boundary.

The shape is what actually costs in wrapper analysis, which is not the same thing as what costs
in a clock walk:

  * a WIDE boundary — every port bit is its own cone, so the port count multiplies everything;
  * a wide BUS whose bits are consumed by different leaves — a net-granular index degenerates to
    O(fanout) per bit here, which is quadratic over the bus;
  * a HUGE top-level body — thousands of child instances and continuous assigns, so any per-hop
    scan of the enclosing module is quadratic over the design;
  * deep-ish pipelines behind each port, so the cone has to walk but still terminate on the
    first flop.

    gen_wrapper_block.py <leaves> <stages> <width> <outdir> [logic_depth]
    register bits = leaves * stages * width      (2048 * 16 * 64 = 2,097,152)
    boundary bits = leaves * 2 (+3 control)

`logic_depth` (default 0) puts that many levels of COMBINATIONAL logic between the boundary and
the first flop, on both sides. A 1-level cone only proves the index lookup is cheap; a 20-30
level cone is what a real datapath boundary looks like and is where the per-hop cost, the
levels threshold and the visited-set all actually get exercised.
"""
import sys, os

LEAVES = int(sys.argv[1]) if len(sys.argv) > 1 else 2048
STAGES = int(sys.argv[2]) if len(sys.argv) > 2 else 16
WIDTH  = int(sys.argv[3]) if len(sys.argv) > 3 else 64
OUT    = sys.argv[4] if len(sys.argv) > 4 else "/tmp/wblock"
DEPTH  = int(sys.argv[5]) if len(sys.argv) > 5 else 0

os.makedirs(OUT, exist_ok=True)
v = []
w = v.append

w("// AUTO-GENERATED wrapper-analysis stress block — see gen_wrapper_block.py.")
w(f"// {LEAVES} leaves x {STAGES} stages x {WIDTH} bits = {LEAVES*STAGES*WIDTH} register bits")
w("")
w(f"module wblk_leaf (clk, rst_n, din, cfg, dout);")
w("  input  wire clk, rst_n;")
w(f"  input  wire [{WIDTH-1}:0] din, cfg;")
w(f"  output wire [{WIDTH-1}:0] dout;")
for s in range(STAGES):
    w(f"  reg [{WIDTH-1}:0] s{s};")
# Combinational depth in FRONT of the first flop and BEHIND the last one. Each level is a
# bit-aligned op so the analysis has to keep tracking bits through all of it.
for lv in range(DEPTH):
    src = "din" if lv == 0 else f"fi{lv-1}"
    w(f"  wire [{WIDTH-1}:0] fi{lv} = ~({src} ^ cfg);")
for lv in range(DEPTH):
    src = f"s{STAGES-1}" if lv == 0 else f"fo{lv-1}"
    w(f"  wire [{WIDTH-1}:0] fo{lv} = ~({src} ^ cfg);")
IN0  = f"fi{DEPTH-1}" if DEPTH else "din"
OUTN = f"fo{DEPTH-1}" if DEPTH else f"s{STAGES-1}"
w("  always @(posedge clk or negedge rst_n)")
w("    if (!rst_n) begin")
for s in range(STAGES):
    w(f"      s{s} <= {WIDTH}'b0;")
w("    end else begin")
w(f"      s0 <= {IN0};                    // port bit -> exactly one flop bit")
for s in range(1, STAGES):
    w(f"      s{s} <= s{s-1} ^ cfg;")
w("    end")
w(f"  assign dout = {OUTN};               // port bit <- exactly one flop bit")
w("endmodule")
w("")

w("module wblk_top (")
w("  clk, rst_n, cfg_in, pi, po")
w(");")
w("  input  wire clk, rst_n;")
w(f"  input  wire [{WIDTH-1}:0] cfg_in;   // shared spine: read by every leaf")
w(f"  input  wire [{LEAVES-1}:0] pi;      // one bit per leaf: the wide-bus case")
w(f"  output wire [{LEAVES-1}:0] po;")
w("")
for i in range(LEAVES):
    w(f"  wire [{WIDTH-1}:0] d{i}, q{i};")
    w(f"  assign d{i} = {{{{{WIDTH-1}{{1'b0}}}}, pi[{i}]}};")
    w(f"  wblk_leaf u{i} (.clk(clk), .rst_n(rst_n), .din(d{i}), .cfg(cfg_in), .dout(q{i}));")
    w(f"  assign po[{i}] = q{i}[0];")
w("endmodule")

path = f"{OUT}/wblk.v"
open(path, "w").write("\n".join(v) + "\n")
open(f"{OUT}/wblk.f", "w").write(path + "\n")
print(f"{LEAVES*STAGES*WIDTH} register bits, {LEAVES*2+WIDTH+2} boundary port bits -> {OUT}/wblk.f",
      file=sys.stderr)
