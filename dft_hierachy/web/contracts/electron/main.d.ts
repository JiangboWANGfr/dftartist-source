import type { WebContents } from "electron";
import type { ProcessExit, ProcessTransportOptions } from "@hier/client/node";

export interface ElectronSessionOptions {
  readonly webContents: WebContents;
  /** Exact URL of the currently loaded, host-approved top-level document. */
  readonly documentUrl: string;
  /** Main-process input only; never accepted from renderer IPC. */
  readonly process: ProcessTransportOptions;
}
export interface ElectronSession {
  readonly id: string;
  readonly exited: Promise<ProcessExit>;
  close(): void;
}
/** Owns a new process and one document binding. Does not construct HierClient. */
export declare function createElectronSession(
  options: ElectronSessionOptions,
): ElectronSession;
