import { HierClient } from "@hier/client";
import { connectElectronTransport } from "@hier/client/electron/renderer";
globalThis.BRun = async () => {
  if (typeof globalThis.require !== "undefined" || typeof globalThis.process !== "undefined")
    throw Error("Node leaked into renderer");
  const keys = Object.keys(globalThis.BHierBridge).sort().join(",");
  if (keys !== "close,connect,release,send,start,version")
    throw Error("unexpected bridge surface " + keys);
  const transport = await connectElectronTransport(globalThis.BHierBridge),
    client = new HierClient(transport);
  client.ready.catch(() => {});
  try {
    const snapshot = await client.ready,
      roots = await client.roots(),
      children = await client.children(snapshot.tops[0].ref);
    return {
      tops: snapshot.tops.map((t) => t.name),
      root: roots.result[0].ref,
      expected: snapshot.tops[0].ref,
      children: Array.isArray(children.result.items),
      complete: [roots.completeness.status, children.completeness.status],
    };
  } finally {
    client.dispose();
  }
};
