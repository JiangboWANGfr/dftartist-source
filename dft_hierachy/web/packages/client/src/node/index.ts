import type { Transport } from "../transport.js";
import { createProcessTransport as createOwnedProcessTransport } from "./process-transport.js";

export interface ProcessResourceLimits {
  /** Spawn to a valid hello; positive integer milliseconds. Omitted means unlimited. */
  openTimeoutMillis?: number;
  /** Cancel frame to its target's terminal reply; expiry ends the entire session. */
  cancelTimeoutMillis?: number;
  /** Sampled resident bytes of the owned Core process; macOS/Linux only. */
  maxRssBytes?: number;
}
export interface ProcessTransportOptions {
  command: string;
  args: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shutdownGraceMillis?: number;
  resourceLimits?: ProcessResourceLimits;
}
export interface ProcessExit {
  code: number | null;
  signal: string | null;
}
export interface ProcessTransport extends Transport {
  readonly exited: Promise<ProcessExit>;
}
/** The Node-only entry owns one child process for its complete lifetime. */
export function createProcessTransport(options: ProcessTransportOptions): ProcessTransport {
  return createOwnedProcessTransport(options);
}
