import type { Transport } from "@hier/client";
import type { ElectronBridge } from "./bridge.js";
export type {
  ElectronBridge,
  ElectronEvent,
  ElectronFailure,
  ElectronConnectResult,
} from "./bridge.js";
/** Claims a configured main session. Core hello is delivered only after onMessage. */
export declare function connectElectronTransport(
  bridge: ElectronBridge,
): Promise<Transport>;
