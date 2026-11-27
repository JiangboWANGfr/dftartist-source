// B-owned wire fixture, not a Core implementation or semantic oracle.
import { createInterface } from "node:readline";
const mode = process.argv[2];
const snapshot = {
  protocol: 2,
  schemaVersion: 7,
  snapshotId: "B-M7",
  inputHash: "a".repeat(64),
  inputHashComplete: true,
  frontend: { name: "slang", version: "B-fixture" },
  bodySharing: "fast",
  tops: [],
  definitionCount: 0,
  bodyCount: 0,
  indexState: "ready",
  openedAt: "2000-01-01T00:00:00.000Z",
  topCandidates: [],
};
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
emit({ event: "b-started", pid: process.pid });
if (mode !== "no-hello")
  emit({
    event: "hello",
    protocol: 2,
    snapshot,
    capabilities: ["cancel", "progress"],
  });
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
const keep = setInterval(() => {}, 1000);
rl.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "cancel") {
    if (mode === "terminal-cancel")
      emit({
        id: request.params.target,
        ok: false,
        error: { code: "cancelled", message: "B terminal", data: {} },
      });
    else emit({ event: "b-cancel-seen", id: request.params.target });
  } else if (request.params?.hold) emit({ event: "b-held", id: request.id });
  else
    emit({
      id: request.id,
      ok: true,
      result: { items: [] },
      completeness: { status: "complete", reasons: [] },
    });
});
rl.on("close", () => {
  clearInterval(keep);
  process.stdin.destroy();
});
