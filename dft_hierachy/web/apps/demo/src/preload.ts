import { contextBridge, ipcRenderer } from "electron";
import { exposeElectronBridge } from "@hier/client/electron/preload";
import type { DemoBridge, DemoChoice, DemoSession } from "./bridge.js";
import { channels, failure, nonempty, record, reply } from "./control-wire.js";

exposeElectronBridge("hierBridge");
async function invoke<T>(channel: string, body: unknown, accepts: (v: unknown) => v is T) {
  try {
    return reply(await ipcRenderer.invoke(channel, body), accepts);
  } catch {
    return failure("ipc_unavailable", "Demo control IPC is unavailable");
  }
}
const bridge: DemoBridge = {
  version: 1,
  pickDesign: (options) =>
    invoke(
      channels.pick,
      { version: 1, options },
      (v): v is DemoChoice | null =>
        v === null || (record(v) && nonempty(v.token) && nonempty(v.label)),
    ),
  openDesign: (token) =>
    invoke(
      channels.open,
      { version: 1, token },
      (v): v is DemoSession => record(v) && nonempty(v.sessionId) && nonempty(v.label),
    ),
  closeDesign: (sessionId) =>
    invoke(channels.close, { version: 1, sessionId }, (v): v is null => v === null),
};
contextBridge.exposeInMainWorld("hierDemo", Object.freeze(bridge));
