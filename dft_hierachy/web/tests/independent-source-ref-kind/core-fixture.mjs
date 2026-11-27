// Original B source literals: coordinates and identities never copied from A witnesses.
export function fixture(macro = false) {
  const assign = macro ? "`B_RK_ASSIGN(stage, d)" : "assign stage = d;";
  const leaf =
    (macro ? "`define B_RK_ASSIGN(dst, src) assign dst = src;\r\n" : "") +
    "// B 独立😀\r\nmodule b_rk_leaf(input logic clk, input logic d, output logic q);\r\n  wire stage;\r\n  " +
    assign +
    "\r\n  always_ff @(posedge clk) q <= stage;\r\nendmodule\r\n";
  const top =
    '`include "b_rk_leaf.svh"\r\nmodule b_rk_top(input logic clk, input logic d, output logic q);\r\n  wire mid;\r\n  b_rk_leaf west(.clk(clk),.d(d),.q(mid));\r\n  b_rk_leaf east(.clk(clk),.d(mid),.q(q));\r\nendmodule\r\n';
  return { leaf, top, assign };
}
export function point(text, marker, inside = 0) {
  const start = text.indexOf(marker);
  if (start < 0 || text.indexOf(marker, start + 1) !== -1)
    throw Error("unique B fixture marker");
  const at = start + inside,
    before = text.slice(0, at),
    line = before.split(/\r\n|\r|\n/);
  return {
    offset: Buffer.byteLength(before),
    line: line.length,
    col: Buffer.byteLength(line.at(-1)) + 1,
  };
}
const basis =
  "DESIGN §6.16 and §5.5.6; original B HDL bytes and public def/instance/port/signal/process/register metadata";
export const cases = [];
for (const perInstance of [false, true])
  for (const macro of [false, true])
    for (const kind of [
      "definition",
      "instance",
      "port",
      "signal",
      "process",
      "register",
    ])
      cases.push({
        id:
          "B-RK-CORE-" +
          (perInstance ? "per" : "shared") +
          "-" +
          (macro ? "macro" : "plain") +
          "-" +
          kind,
        input: { perInstance, macro, kind, limits: [1, 2, 200] },
        expected:
          "every target occurrence present, full original-field projection stable across limits; all returned hits use independently known refKind, no prefix/kind/inst inference",
        basis,
      });
