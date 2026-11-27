// B literal DTOs, accepted by existing public L6 types. No SourceView logic.
export const complete = Object.freeze({
  status: "complete",
  reasons: Object.freeze([]),
});
export const hashA = "a".repeat(64),
  hashB = "b".repeat(64);
export const target = Object.freeze({
  ref: "B-source-view-ref",
  kind: "definition",
});
export const position = (text, offset) => {
  const parts = text.slice(0, offset).split(/\r\n|\r|\n/);
  return Object.freeze({
    offset,
    line: parts.length,
    column: parts.at(-1).length + 1,
  });
};
const reply = (result) =>
  Object.freeze({ result: Object.freeze(result), completeness: complete });
export function document(text, start = 0, end = text.length, changed = false) {
  const snapshotText = changed ? "B old snapshot\n".repeat(90) : text,
    encoder = new TextEncoder();
  const oldStart = changed ? snapshotText.length - 8 : start,
    oldEnd = changed ? snapshotText.length : end;
  const wirePos = (offset) => ({
    ...position(snapshotText, offset),
    offset: encoder.encode(snapshotText.slice(0, offset)).length,
    column:
      encoder.encode(
        snapshotText
          .slice(0, offset)
          .split(/\r\n|\r|\n/)
          .at(-1),
      ).length + 1,
  });
  return Object.freeze({
    source: reply({
      file: "B-source-view-file",
      path: "/B-source-view/space 中文.sv",
      start: wirePos(oldStart),
      end: wirePos(oldEnd),
      contentHash: hashA,
    }),
    content: reply({
      text,
      contentHash: changed ? hashB : hashA,
      matchesSnapshot: !changed,
    }),
    location: changed
      ? Object.freeze({ status: "changed" })
      : Object.freeze({
          status: "exact",
          range: Object.freeze({
            start: position(text, start),
            end: position(text, end),
          }),
        }),
  });
}
export const success = (data) =>
  Object.freeze({ status: "success", target, data });
export function state(
  status = "idle",
  data = document("module b;\nendmodule", 7, 8),
  error,
) {
  if (status === "success") return success(data);
  if (status === "idle") return Object.freeze({ status, target: null });
  if (status === "pending") return Object.freeze({ status, target });
  return Object.freeze({
    status,
    target,
    error:
      error ??
      Object.freeze({
        origin: "source",
        code: status === "cancelled" ? "cancelled" : "invalid_argument",
        message: "B diagnostic <raw>",
        data: Object.freeze({}),
      }),
  });
}
export function badValue(name) {
  return {
    empty: "",
    blank: " \t\n\u3000",
    null: null,
    undefined: undefined,
    number: 7,
    boxed: new String("B"),
    symbol: Symbol("B"),
    zero: 0,
    "negative-zero": -0,
    negative: -1,
    nan: NaN,
    infinity: Infinity,
    "negative-infinity": -Infinity,
    string: "280",
    array: [],
  }[name];
}
export const longText = Array.from(
  { length: 150 },
  (_, i) =>
    String(i).padStart(3, "0") + " " + (i === 120 ? "Z".repeat(240) : "line"),
).join("\n");
export const point = longText.indexOf("120 ") + 190;
