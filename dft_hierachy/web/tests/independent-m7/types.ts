import {
  createProcessTransport,
  type ProcessResourceLimits,
  type ProcessTransportOptions,
  type ProcessTransport,
} from "@hier/client/node";
import * as main from "@hier/client";
const limits: ProcessResourceLimits = {
  openTimeoutMillis: 1,
  cancelTimeoutMillis: 2147483647,
  maxRssBytes: Number.MAX_SAFE_INTEGER,
};
const old: ProcessTransportOptions = { command: "hier", args: ["serve"] };
const extended: ProcessTransportOptions = { ...old, resourceLimits: limits };
const transport: ProcessTransport = createProcessTransport(extended);
const exit: Promise<{ code: number | null; signal: string | null }> =
  transport.exited;
createProcessTransport(old);
createProcessTransport({ ...old, resourceLimits: {} });
// @ts-expect-error budget is numeric, no text at the Node API
const bad: ProcessResourceLimits = { maxRssBytes: "off" };
// @ts-expect-error renderer/main package does not export Node factory
main.createProcessTransport(old);
// @ts-expect-error unknown budget field rejected
const unknown: ProcessResourceLimits = { maxMemory: 1 };
void [exit, bad, unknown];
