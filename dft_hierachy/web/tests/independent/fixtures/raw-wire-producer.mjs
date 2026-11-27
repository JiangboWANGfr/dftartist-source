// B-owned raw-wire boundary peer, not Core and not an implementation oracle.
import { createInterface } from "node:readline";
const [mode = "normal", token = "1", where = "value"] = process.argv.slice(2);
const inst = {
  ref: "i:0",
  name: "root",
  path: ["root"],
  pathText: "root",
  kind: "module",
  def: "d:0",
  defName: "root",
  childCount: 0,
  hasParamOverrides: false,
};
const snapshot = {
  protocol: 2,
  schemaVersion: 7,
  frontend: { name: "slang", version: "12.0" },
  bodySharing: "fast",
  tops: [inst],
  definitionCount: 1,
  bodyCount: 1,
  snapshotId: "b-raw",
  inputHash: "a".repeat(64),
  inputHashComplete: true,
  indexState: "ready",
  openedAt: "2026-10-13T00:00:00.000Z",
  topCandidates: ["i:0"],
};
const complete = '{"status":"complete","reasons":[]}';
process.stdout.on("error", () => process.exit(0));
const out = (text) => process.stdout.write(text + "\n");
out(
  JSON.stringify({
    event: "hello",
    protocol: 2,
    schemaVersion: 7,
    snapshot,
    capabilities: ["cancel", "progress"],
  }),
);
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "cancel") return;
  let result;
  if (request.method === "inst.get") {
    result = JSON.stringify(inst);
    if (mode === "count")
      result = result.replace('"childCount":0', '"childCount":' + token);
    if (mode === "unicode" && where === "name")
      result = result.replace('"name":"root"', '"name":' + token);
  } else if (request.method === "design.diagnostics") {
    result = '{"errorCount":0,"warningCount":0,"truncated":false,"items":[]}';
    if (mode === "safe-count")
      result = result.replace('"errorCount":0', '"errorCount":' + token);
  } else if (request.method === "def.list") result = '{"items":[]}';
  else if (request.method === "conn.drivers") result = "[]";
  else if (request.method === "path.resolve") result = '["i:0"]';
  else throw new Error("B peer received unexpected method: " + request.method);
  const id = mode === "id" ? token : String(request.id);
  let extension = "";
  if (mode === "unicode" && where === "value")
    extension = ',"future":{"nested":[' + token + "]}";
  if (mode === "unicode" && where === "key")
    extension = ',"future":{' + token + ":true}";
  if (mode === "fraction") extension = ',"future":{"fraction":' + token + "}";
  out(
    '{"id":' +
      id +
      ',"ok":true,"result":' +
      result +
      ',"completeness":' +
      complete +
      extension +
      "}",
  );
});
lines.on("close", () => process.stdout.end());
