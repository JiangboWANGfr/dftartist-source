import type { ElectronFailure } from "@hier/client/electron/renderer";

/** App-private controls; never added to the generic transport bridge. */
export interface DemoPickOptions {
  readonly kind: "source" | "filelist";
  readonly top?: string;
}
export interface DemoChoice {
  readonly token: string;
  readonly label: string;
}
export interface DemoSession {
  readonly sessionId: string;
  readonly label: string;
}
export interface DemoFailure {
  readonly code: "bad_request" | "busy" | "stale_choice" | "host_failure" | "ipc_unavailable";
  readonly origin: "demo";
  readonly message: string;
  readonly cause?: ElectronFailure;
}
export type DemoReply<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: DemoFailure };
export interface DemoBridge {
  readonly version: 1;
  pickDesign(options: DemoPickOptions): Promise<DemoReply<DemoChoice | null>>;
  openDesign(token: string): Promise<DemoReply<DemoSession>>;
  closeDesign(sessionId: string): Promise<DemoReply<null>>;
}
