// B compile-only consumer, using only the documented HierClient public surface.
import { HierClient } from "@hier/client";
declare const client: HierClient;
const snapshot = client.snapshot;
const identity: string = snapshot.snapshotId;
const hash: string = snapshot.inputHash;
const captured: boolean = snapshot.inputHashComplete;
const index: "building" | "ready" = snapshot.indexState;
const opened: string = snapshot.openedAt;
const candidates: readonly string[] = snapshot.topCandidates;
const ready = client.ready;
client.children(identity, { cursor: "", limit: 200 });
client.signals(identity, { filter: { text: "a" }, limit: 1 });
client.search({ text: "a", kinds: ["signal"], scope: identity }, { limit: 1 });
client.drivers({ slice: { ref: identity }, reach: "hier" });
client.step({ from: { ref: identity }, direction: "back" });
client.source(identity, "definition");
client.resolveSource({ file: "B-file", line: 1 }, { limit: 1 });
client.readSource("B-file");
void [hash, captured, index, opened, candidates, ready];
// @ts-expect-error PageReq.limit is not nullable.
client.children(identity, { limit: null });
// @ts-expect-error Direction uses lowercase declared names.
client.step({ from: { ref: identity }, direction: "Backward" });
// @ts-expect-error The snapshot getter itself is readonly.
client.snapshot = snapshot;
