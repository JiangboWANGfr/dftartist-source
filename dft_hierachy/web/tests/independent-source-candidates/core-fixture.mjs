// B byte fixture: existing independent include HDL plus a distinct macro call.
export {
  leafText,
  topText,
  leafDeclaration,
} from "../independent-source-document/source-fixture.mjs";
export const macroLeaf =
  "`define B_SC_ASSIGN(dst, src) assign dst = src;\r\nmodule b_sc_macro(input wire d, output wire q);\r\n  `B_SC_ASSIGN(q, d)\r\nendmodule\r\n";
export const macroTop =
  '`include "b_sc_macro.svh"\r\nmodule b_sc_macro_top(input wire d, output wire q);\r\n  wire inner;\r\n  b_sc_macro west(.d(d),.q(inner));\r\n  b_sc_macro east(.d(inner),.q(q));\r\nendmodule\r\n';
export const macroDeclaration =
  "module b_sc_macro(input wire d, output wire q);\r\n  `B_SC_ASSIGN(q, d)\r\nendmodule";
export const macroInvocation = "`B_SC_ASSIGN(q, d)";
export function byteRange(text, literal) {
  const start = text.indexOf(literal);
  if (start < 0 || text.indexOf(literal, start + 1) !== -1)
    throw Error("B unique marker");
  const pos = (offset) => {
    const lines = text.slice(0, offset).split(/\r\n|\r|\n/);
    return {
      offset: Buffer.byteLength(text.slice(0, offset)),
      line: lines.length,
      column: Buffer.byteLength(lines.at(-1)) + 1,
    };
  };
  return { start: pos(start), end: pos(start + literal.length) };
}
