import type { BrowserWindow } from "electron";
import type { ProcessExit, ProcessTransportOptions } from "@hier/client/node";
import { createElectronSession, type ElectronSession } from "./main.js";

declare const window: BrowserWindow;
const process: ProcessTransportOptions = {
  command: "/path/to/hier",
  args: ["serve", "fixture.sv"],
  shutdownGraceMillis: 2000,
};
const session: ElectronSession = createElectronSession({
  webContents: window.webContents,
  documentUrl: window.webContents.getURL(),
  process,
});
const exited: Promise<ProcessExit> = session.exited;
session.close();
void exited;
createElectronSession({
  // @ts-expect-error a window is not the precise webContents binding
  webContents: window,
  documentUrl: "app://hier/index.html",
  process,
});
createElectronSession({
  // @ts-expect-error a string id is not an Electron WebContents
  webContents: "1",
  documentUrl: "app://hier/index.html",
  process,
});
// @ts-expect-error explicit approved document URL is required
createElectronSession({ webContents: window.webContents, process });
createElectronSession({
  webContents: window.webContents,
  documentUrl: "app://hier/index.html",
  // @ts-expect-error shell command strings cannot replace an argument array
  process: { command: "hier", args: "serve fixture.sv" },
});
// @ts-expect-error session identity is immutable
session.id = "other";
// @ts-expect-error main does not expose SDK queries
session.roots();
