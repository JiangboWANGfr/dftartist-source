#!/usr/bin/env python3
"""Generates a synthetic design for scale measurements (docs/DESIGN.md 9.2).

A tree of `node` modules: each node has FANOUT children and some logic of its own;
leaves hold a small registered datapath. Instance count = sum(FANOUT**d, d=0..DEPTH).

--unique N gives the first N leaves a distinct parameter value each, so they become N
distinct module bodies: the worst case for sharing. With --unique 0 every leaf is the
same body, the best case.

usage: gen.py --fanout 10 --depth 5 [--unique 0] > design.sv
"""
import argparse

p = argparse.ArgumentParser()
p.add_argument("--fanout", type=int, default=10)
p.add_argument("--depth", type=int, default=5)
p.add_argument("--unique", type=int, default=0)
a = p.parse_args()

print("""module leaf #(parameter int W = 8, parameter int SEED = 0)
  (input logic clk, input logic rst_n, input logic [W-1:0] d, output logic [W-1:0] q);
  logic [W-1:0] t;
  assign t = {d[W/2-1:0], d[W-1:W/2]} ^ W'(SEED);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q <= '0;
    else        q <= t + d;
endmodule
""")

# One module per level so depth is fixed by the module, not by recursion. A level's
# SEED_BASE parameter is passed down so that unique leaves get distinct values.
for level in range(a.depth - 1, -1, -1):
    child = "leaf" if level == a.depth - 1 else f"node{level + 1}"
    span = a.fanout ** (a.depth - 1 - level)  # leaves under each child
    print(f"module node{level} #(parameter int W = 8, parameter int BASE = 0)")
    print("  (input logic clk, input logic rst_n, input logic [W-1:0] d, output logic [W-1:0] q);")
    print(f"  logic [W-1:0] c [{a.fanout}];")
    print(f"  for (genvar i = 0; i < {a.fanout}; i++) begin : g")
    if child == "leaf":
        seed = f"((BASE + i) < {a.unique} ? BASE + i + 1 : 0)"
        print(f"    leaf #(.W(W), .SEED({seed})) u (.clk, .rst_n, .d(d ^ W'(i)), .q(c[i]));")
    else:
        # Subtrees entirely beyond the unique range all get BASE = unique, so they stay
        # identical bodies instead of differing only by an unused parameter.
        base = f"((BASE + i * {span}) < {a.unique} ? BASE + i * {span} : {a.unique})"
        print(f"    {child} #(.W(W), .BASE({base})) u (.clk, .rst_n, .d(d ^ W'(i)), .q(c[i]));")
    print("  end")
    print("  always_comb begin")
    print("    q = '0;")
    print(f"    for (int i = 0; i < {a.fanout}; i++) q ^= c[i];")
    print("  end")
    print("endmodule\n")

print("""module top(input logic clk, input logic rst_n, input logic [7:0] d, output logic [7:0] q);
  node0 #(.W(8), .BASE(0)) u (.clk, .rst_n, .d, .q);
endmodule""")
