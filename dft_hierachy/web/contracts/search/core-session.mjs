import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HierClient } from "@hier/client";
import { createProcessTransport } from "@hier/client/node";

export const command = process.env.HIER_BIN;
assert.ok(command, "HIER_BIN must point to this checkout's built Core");
export const fixture = fileURLToPath(new URL("./search.sv", import.meta.url));

// Callers dispose borrowed models before this registered session cleanup runs.
export async function createSession(t) {
  const transport = createProcessTransport({
    command: path.resolve(command),
    args: ["serve", fixture],
  });
  const client = new HierClient(transport);
  t.after(async () => {
    client.dispose();
    const exit = await transport.exited;
    assert.deepEqual(exit, { code: 0, signal: null });
    console.log(JSON.stringify({ test: t.name, coreExit: exit }));
  });
  await client.ready;
  return client;
}
