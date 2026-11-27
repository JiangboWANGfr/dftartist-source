import { HierClient, type Transport } from "@hier/client";
import { TreeModel, SelectionModel } from "@hier/viewmodel";
import {
  connectElectronTransport,
  type ElectronBridge,
  type ElectronEvent,
} from "./renderer.js";

declare const bridge: ElectronBridge;
export async function mountSession() {
  const transport: Transport = await connectElectronTransport(bridge);
  const client = new HierClient(transport);
  try {
    const snapshot = await client.ready;
    const tree = new TreeModel(client);
    const selection = new SelectionModel({ snapshotId: snapshot.snapshotId });
    // Host mounts borrowed views here; this example only compiles ownership.
    tree.dispose();
    selection.dispose();
  } finally {
    client.dispose();
  }
}
function eventConsumer(event: ElectronEvent) {
  if (event.kind === "frame") {
    const text: string = event.json;
    void text;
  } else {
    const reason: unknown = event.error?.data.reason;
    void reason;
  }
}
void eventConsumer;
// @ts-expect-error no renderer-controlled process launching
connectElectronTransport({ command: "hier", args: ["serve"] });
// @ts-expect-error bridge is an input, not an already connected Transport
const invalid: Transport = bridge;
// @ts-expect-error bridge version is not the Core protocol version
const badBridge: ElectronBridge = { ...bridge, version: 2 };
// @ts-expect-error IPC accepts raw JSON strings, not parsed objects
bridge.send("session", { id: 1 });
// @ts-expect-error no arbitrary IPC channel interface
bridge.invoke("read-file", "/etc/passwd");
// @ts-expect-error a callback is needed before the asynchronous claim
bridge.connect();
const badEvent: ElectronEvent = {
  version: 1,
  sessionId: "session",
  kind: "frame",
  // @ts-expect-error frame packet cannot carry parsed data in place of raw JSON
  json: {},
};
void [invalid, badBridge, badEvent];
