// Health check uses actual public SDK/renderer transport, never a fake IPC/Core.
import { HierClient } from "@hier/client";
import { connectElectronTransport } from "@hier/client/electron/renderer";
export async function roots(bridge) {
  const transport = await connectElectronTransport(bridge),
    client = new HierClient(transport);
  client.ready.catch(() => {});
  try {
    await client.ready;
    const r = await client.roots();
    return { names: r.result.map((x) => x.name), complete: r.completeness.status };
  } finally {
    client.dispose();
  }
}
