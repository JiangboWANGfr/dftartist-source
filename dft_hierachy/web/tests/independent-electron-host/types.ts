import {
  createElectronSession,
  type ElectronSession,
  type ElectronSessionOptions,
} from "@hier/client/electron/main";
import { exposeElectronBridge } from "@hier/client/electron/preload";
import type { WebContents } from "electron";
declare const webContents: WebContents;
const opts: ElectronSessionOptions = {
  webContents,
  documentUrl: "file:///B71.html",
  process: { command: "hier", args: ["serve"], shutdownGraceMillis: 0 },
};
const s: ElectronSession = createElectronSession(opts);
const id: string = s.id;
const e: Promise<{ code: number | null; signal: string | null }> = s.exited;
s.close();
exposeElectronBridge("BApi");
void id;
void e;
// @ts-expect-error H01: options required
createElectronSession();
// @ts-expect-error H02: actual WebContents not DTO
createElectronSession({ ...opts, webContents: { getURL: () => "B" } });
// @ts-expect-error H03: absolute URL representation is a string
createElectronSession({ ...opts, documentUrl: 3 });
// @ts-expect-error H04: process options required
createElectronSession({ webContents, documentUrl: "B" });
// @ts-expect-error H05: args array required
createElectronSession({ ...opts, process: { command: "hier", args: "serve" } });
// @ts-expect-error H06: command string required
createElectronSession({ ...opts, process: { command: 7, args: [] } });
// @ts-expect-error H07: bridge key string required
exposeElectronBridge(4);
// @ts-expect-error H08: bridge key required
exposeElectronBridge();
// @ts-expect-error H09: id readonly
s.id = "other";
// @ts-expect-error H10: exited readonly
s.exited = Promise.resolve({ code: 0, signal: null });
// @ts-expect-error H11: close takes no query or force option
s.close({ force: true });
// @ts-expect-error H12: Session is not SDK
s.roots();
// @ts-expect-error H13: optional cwd absent is not undefined under exactOptional
createElectronSession({ ...opts, process: { command: "hier", args: [], cwd: undefined } });
// @ts-expect-error H14: SessionOptions has no renderer supplied shell
createElectronSession({ ...opts, shell: "bash" });
const invalidGrace = {
  ...opts,
  process: { command: "hier", args: [], shutdownGraceMillis: "0" },
};
// @ts-expect-error H15: process grace is number
createElectronSession(invalidGrace);
// @ts-expect-error H16: no process ownership transferable API
s.process.kill();
