#!/usr/bin/env python3
"""Generate a multi-core SoC stress harness around the user's REAL processor_core.

Nothing under /home/wongw/nx9000 is modified — this only writes a new top + SDC + filelist into
/tmp and reuses their RTL by reference. The clock tree is deliberately deep and conditional so it
exercises the parts that actually cost: hierarchy hops, RTL clock gates, muxes whose select only
resolves through the implication engine, and massive shared-spine fanout (the memo's target).

    dco_clk -> alias -> clkbuf(module, so the walk descends+ascends)
            -> per-cluster RTL clock gate   (enable = scan_mode | func_en)
            -> per-core mux                 (select = scan_mode, only resolvable by implication)
            -> per-core RTL clock gate      (enable = scan_enable | core_en)
            -> processor_core.dco_clk       (~1475 register bits, ~146 groups each)
"""
import re, sys, os

SRC = "/home/wongw/nx9000/design/processor_core/processor_core.v"
VC  = "/home/wongw/nx9000/design/processor_core/processor_core.vc"
NCLUSTER = int(sys.argv[1]) if len(sys.argv) > 1 else 4
NCORE    = int(sys.argv[2]) if len(sys.argv) > 2 else 4
OUT      = sys.argv[3] if len(sys.argv) > 3 else "/tmp/stress"

os.makedirs(OUT, exist_ok=True)
text = open(SRC, encoding="utf-8", errors="replace").read()
m = re.search(r"module\s+processor_core\s*\((.*?)\)\s*;", text, re.S)
if not m:
    sys.exit("could not find the processor_core port list")

ports = []          # (dir, width, name)
for line in m.group(1).split("\n"):
    line = line.split("//")[0].strip().rstrip(",")
    pm = re.match(r"(input|output|inout)\s+(?:wire|reg)?\s*(\[[^\]]*\])?\s*(\w+)$", line)
    if pm:
        ports.append((pm.group(1), pm.group(2) or "", pm.group(3)))
ins  = [p for p in ports if p[0] == "input"]
outs = [p for p in ports if p[0] != "input"]
print(f"processor_core: {len(ins)} inputs, {len(outs)} outputs", file=sys.stderr)

CLK_IN = "dco_clk"
CTRL   = {"scan_enable", "scan_mode", "reset_n"}

v = []
w = v.append
w("// AUTO-GENERATED stress harness — see gen_stress.py. Do not edit; regenerate instead.")
w("module clkbuf(input wire i, output wire o);")
w("  assign o = i;")
w("endmodule")
w("")
w("module clkg(input wire ck, input wire en, output wire gck);")
w("  assign gck = ck & en;              // RTL clock gate: only crossable when en implies 1")
w("endmodule")
w("")
w("module clkmux(input wire a, input wire b, input wire s, output wire y);")
w("  assign y = s ? a : b;              // select must be justified, never guessed")
w("endmodule")
w("")
w(f"module soc_top(")
w("  input  wire dco_clk, input wire scan_enable, input wire scan_mode, input wire reset_n,")
w("  input  wire func_en, input wire core_en, input wire alt_clk,")
w("  output wire done")
w(");")
w("  wire clk_root;")
w("  assign clk_root = dco_clk;          // net alias: renamed, not a cell")
w("  wire clk_b1, clk_b2;")
w("  clkbuf u_b1(.i(clk_root), .o(clk_b1));")
w("  clkbuf u_b2(.i(clk_b1),   .o(clk_b2));   // two module hops -> descend + ascend each")
w("")

sinks = []
for c in range(NCLUSTER):
    w(f"  wire cl{c}_en, cl{c}_clk;")
    w(f"  assign cl{c}_en = scan_mode | func_en;   // implication: scan_mode=1 dominates the OR")
    w(f"  clkg u_clg{c}(.ck(clk_b2), .en(cl{c}_en), .gck(cl{c}_clk));")
    for k in range(NCORE):
        n = f"{c}_{k}"
        w(f"  wire co{n}_sel, co{n}_mux, co{n}_en, co{n}_clk;")
        w(f"  assign co{n}_sel = scan_mode;")
        w(f"  assign co{n}_en  = scan_enable | core_en;")
        w(f"  clkmux u_cmx{n}(.a(cl{c}_clk), .b(alt_clk), .s(co{n}_sel), .y(co{n}_mux));")
        w(f"  clkg   u_cg{n} (.ck(co{n}_mux), .en(co{n}_en), .gck(co{n}_clk));")
        conns = []
        for _, _, name in ins:
            if name == CLK_IN:            conns.append(f".{name}(co{n}_clk)")
            elif name in CTRL:            conns.append(f".{name}({name})")
            else:                         conns.append(f".{name}()")
        for _, _, name in outs:           conns.append(f".{name}()")
        w(f"  processor_core u_core{n}(" + ", ".join(conns) + ");")
        sinks.append(f"co{n}_clk")
    w("")
w("  assign done = 1'b1;")
w("endmodule")

open(f"{OUT}/soc_top.v", "w").write("\n".join(v) + "\n")

# SDC: one real clock at the SoC root + the DFT constants the implication engine needs.
open(f"{OUT}/soc.sdc", "w").write(
    "create_clock -name SOC_CLK -period 2.0 [get_ports dco_clk]\n"
    "set_case_analysis 1 [get_ports scan_mode]\n"
    "set_case_analysis 1 [get_ports scan_enable]\n")

# filelist: their real sources, then our top.
orig = open(VC, encoding="utf-8", errors="replace").read()
open(f"{OUT}/soc.vc", "w").write(orig.rstrip() + f"\n{OUT}/soc_top.v\n")
print(f"{NCLUSTER}x{NCORE} = {NCLUSTER*NCORE} processor_core instances -> {OUT}/soc.vc",
      file=sys.stderr)
