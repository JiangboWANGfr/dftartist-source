// Independent B HDL, deliberately unrelated to A's Source witness.
export const leafText =
  "\uFEFF// 中😀 e\u0301\tB fixture\r\nmodule b_sd_leaf(input logic d, output logic q);\r\n  assign q = d;\r\nendmodule\r\n";
export const topText =
  '`include "b_sd_leaf.svh"\r\nmodule b_sd_top(input logic d, output logic q);\r\n  logic inner;\r\n  b_sd_leaf left(.d(d), .q(inner));\r\n  b_sd_leaf right(.d(inner), .q(q));\r\nendmodule\r\n';
export const leafDeclaration =
  "module b_sd_leaf(input logic d, output logic q);\r\n  assign q = d;\r\nendmodule";
export const topDeclaration =
  "module b_sd_top(input logic d, output logic q);\r\n  logic inner;\r\n  b_sd_leaf left(.d(d), .q(inner));\r\n  b_sd_leaf right(.d(inner), .q(q));\r\nendmodule";
export const instantiations = {
  left: "left(.d(d), .q(inner))",
  right: "right(.d(inner), .q(q))",
};
// Expected coordinates from literal file text, never from observed Core results.
export function expectedRange(text, literal) {
  const start = text.indexOf(literal);
  if (start < 0 || text.indexOf(literal, start + 1) !== -1)
    throw Error("B fixture marker must be unique");
  const end = start + literal.length;
  const at = (offset) => {
    const before = text.slice(0, offset),
      lines = before.split(/\r\n|\r|\n/);
    return { offset, line: lines.length, column: lines.at(-1).length + 1 };
  };
  return { start: at(start), end: at(end) };
}
