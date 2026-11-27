import { exposeElectronBridge } from "./preload.js";
exposeElectronBridge("hierarchy");
// @ts-expect-error require an explicit host-owned API key
exposeElectronBridge();
// @ts-expect-error no generic ipcRenderer or transport accepted
exposeElectronBridge({ send: () => {} });
