import fs from "node:fs";
export function transitionSource() {
  const source = fs.readFileSync(
    new URL("../fixture.jsx", import.meta.url),
    "utf8",
  );
  const begin = source.indexOf("function l02Transition(s, kind) {");
  const end = source.indexOf("\nfunction l02Capture()", begin);
  if (begin < 0 || end < 0)
    throw new Error("Actual B transition function not found");
  return source.slice(begin, end);
}
