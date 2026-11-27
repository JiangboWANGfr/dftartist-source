import type { ClientErrorCode } from "@hier/client";
import type { WireErrorCode } from "@hier/protocol-types";

/** Cloneable error data. No Error instance crosses Electron or contextBridge. */
export interface ElectronFailure {
  readonly code: WireErrorCode | ClientErrorCode;
  readonly origin: "core" | "client" | "transport";
  readonly message: string;
  readonly data: Readonly<Record<string, unknown>>;
}
export type ElectronEvent =
  | {
      readonly version: 1;
      readonly sessionId: string;
      readonly kind: "frame";
      readonly json: string;
    }
  | {
      readonly version: 1;
      readonly sessionId: string;
      readonly kind: "closed";
      readonly error?: ElectronFailure;
    };
export type ElectronConnectResult =
  | { readonly ok: true; readonly version: 1; readonly sessionId: string }
  | { readonly ok: false; readonly error: ElectronFailure };

/** Only these named capabilities cross contextBridge; not generic IPC access. */
export interface ElectronBridge {
  readonly version: 1;
  connect(
    onEvent: (event: ElectronEvent) => void,
  ): Promise<ElectronConnectResult>;
  start(sessionId: string): void;
  send(sessionId: string, json: string): void;
  close(sessionId: string): void;
  /** Local callback cleanup. Does not close the main-process session. */
  release(sessionId: string): void;
}
