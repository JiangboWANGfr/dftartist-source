// Which ScanHost chain group a controller belongs to.
//
// A chain group is NOT one EDT. The wire on the canvas says which ScanHost a controller hangs
// off; `Connections.ssh_chain_group` in the controller's own config says which group it joins on
// that host. Keeping the two apart is what lets several controllers share one group — name them
// the same and they land in one `ChainGroup (name) { … }`, sized for all of them.
//
// The default is the controller's own name, which is the common one-group-per-EDT case. Nothing
// is fixed to a house name like `edt_gp`: that made every controller collide in one group whether
// or not it was wired that way.

import type { DftIpInstance } from "../genconn/core/dft-model.ts";

export function chainGroupOf(ip: Pick<DftIpInstance, "instanceName" | "config">): string {
  const conn = (ip.config as Record<string, unknown> | undefined)?.Connections;
  const g = conn && typeof conn === "object"
    ? (conn as Record<string, unknown>).ssh_chain_group : undefined;
  return typeof g === "string" && g.trim() ? g.trim() : ip.instanceName;
}

/** group id -> the controllers on it, for every EDT in the list. */
export function chainGroupMembers(
  ips: readonly Pick<DftIpInstance, "ipType" | "instanceName" | "config">[]
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const ip of ips) {
    if (ip.ipType !== "Edt") continue;
    const g = chainGroupOf(ip);
    const cur = out.get(g);
    if (cur) { if (!cur.includes(ip.instanceName)) cur.push(ip.instanceName); }
    else out.set(g, [ip.instanceName]);
  }
  return out;
}
