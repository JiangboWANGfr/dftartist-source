import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute } from "node:path";
import { createElectronSession, type ElectronSession } from "@hier/client/electron/main";
import { isHierError } from "@hier/client";
import type { DemoChoice, DemoPickOptions, DemoReply, DemoSession } from "./bridge.js";
import type { ProcessResourceLimits } from "@hier/client/node";
import { channels, failure, pickOptions, record } from "./control-wire.js";
import { designProgress, rendererProgress } from "./design-progress.js";
import { diagnostic } from "./design-diagnostic.js";

interface Choice extends DemoChoice {
  readonly path: string;
  readonly options: DemoPickOptions;
}
interface OwnedSession {
  readonly session: ElectronSession;
  closing?: Promise<void>;
}

/** One approved window/document and at most one child. Contains no SDK or DFT rules. */
export class DesignHost {
  private epoch = 0;
  private frame: Electron.WebFrameMain | undefined;
  private choice: Choice | undefined;
  private current: OwnedSession | undefined;
  private terminalId: string | undefined;
  private busy = false;
  private disposed = false;
  private shutdownTask: Promise<void> | undefined;

  constructor(
    private readonly window: BrowserWindow,
    private readonly documentUrl: string,
    private readonly command: string,
    private readonly resourceLimits?: ProcessResourceLimits,
  ) {
    const web = window.webContents;
    web.setWindowOpenHandler(() => ({ action: "deny" }));
    web.on("will-navigate", (event, url) => {
      if (url !== documentUrl) event.preventDefault();
    });
    web.on("will-redirect", (event) => event.preventDefault());
    web.on("did-start-navigation", (details) => {
      if (details.isMainFrame) this.invalidate();
    });
    web.on("did-finish-load", () => {
      if (!this.disposed && web.getURL() === documentUrl) this.frame = web.mainFrame;
    });
    web.on("console-message", (details) => {
      if (
        this.disposed || !this.frame || details.frame !== this.frame ||
        web.mainFrame !== this.frame || web.getURL() !== documentUrl
      ) return;
      const progress = rendererProgress(details.message);
      if (progress !== undefined) console.info(progress);
    });
    web.on("render-process-gone", () => this.invalidate());
    web.on("destroyed", () => this.invalidate());
    for (const operation of ["pick", "open", "close"] as const)
      ipcMain.handle(channels[operation], (event, body) => this.dispatch(operation, event, body));
  }

  private authorized(event: IpcMainInvokeEvent, epoch = this.epoch): boolean {
    const web = this.window.webContents;
    return (
      !this.disposed &&
      epoch === this.epoch &&
      !!this.frame &&
      !web.isDestroyed() &&
      event.sender === web &&
      event.senderFrame === this.frame &&
      web.mainFrame === this.frame &&
      web.getURL() === this.documentUrl
    );
  }

  private async dispatch(
    operation: "pick" | "open" | "close",
    event: IpcMainInvokeEvent,
    body: unknown,
  ): Promise<DemoReply<DemoChoice | DemoSession | null>> {
    if (!this.authorized(event) || !record(body) || body.version !== 1)
      return failure("bad_request", "Invalid demo control request");
    if (this.busy) return failure("busy", "Another design operation is pending");
    const epoch = this.epoch;
    this.busy = true;
    designProgress("host", epoch, operation);
    try {
      if (operation === "pick") {
        if (!pickOptions(body.options)) return failure("bad_request", "Invalid design options");
        const options = { ...body.options };
        this.choice = undefined;
        const selected = await dialog.showOpenDialog(this.window, {
          title: options.kind === "source" ? "打开 HDL 文件" : "打开文件列表",
          properties: ["openFile"],
        });
        if (!this.authorized(event, epoch))
          return failure("bad_request", "The selecting document is no longer active");
        if (selected.canceled) return { ok: true, value: null };
        const path = selected.filePaths[0];
        if (selected.filePaths.length !== 1 || !path || !isAbsolute(path))
          return failure("host_failure", "The picker did not return one absolute filename");
        this.choice = { token: randomUUID(), label: basename(path), path, options };
        designProgress("host", epoch, "picked");
        return { ok: true, value: { token: this.choice.token, label: this.choice.label } };
      }
      if (operation === "open") {
        const choice = this.choice;
        if (!choice || body.token !== choice.token)
          return failure("stale_choice", "Choose a design again; this choice is no longer valid");
        this.choice = undefined;
        await this.closeCurrent();
        if (!this.authorized(event, epoch))
          return failure("bad_request", "The opening document is no longer active");
        const top = choice.options.top === undefined ? [] : ["--top", choice.options.top];
        const session = createElectronSession({
          webContents: this.window.webContents,
          documentUrl: this.documentUrl,
          process: {
            command: this.command,
            args: [
              "serve",
              ...top,
              ...(choice.options.kind === "filelist" ? ["-F"] : []),
              choice.path,
            ],
            cwd: dirname(choice.path),
            ...(this.resourceLimits === undefined ? {} : { resourceLimits: this.resourceLimits }),
          },
        });
        designProgress("host", epoch, "spawn");
        this.current = { session };
        this.terminalId = undefined;
        // Observe spontaneous rejection immediately; closeCurrent still reports it to its caller.
        void session.exited.catch((error: unknown) => console.error("Core exit failed", error));
        return { ok: true, value: { sessionId: session.id, label: choice.label } };
      }
      if (
        typeof body.sessionId !== "string" ||
        (body.sessionId !== this.current?.session.id && body.sessionId !== this.terminalId)
      )
        return failure("bad_request", "Invalid design session");
      await this.closeCurrent();
      return { ok: true, value: null };
    } catch (error) {
      designProgress("host", epoch, "failed");
      if (isHierError(error))
        return {
          ok: false,
          error: {
            code: "host_failure",
            origin: "demo",
            message: error.message,
            cause: {
              code: error.code,
              origin: error.origin,
              message: error.message,
              data: structuredClone(error.data),
            },
          },
        };
      return failure("host_failure", diagnostic(error));
    } finally {
      this.busy = false;
    }
  }

  private closeCurrent(): Promise<void> {
    const owned = this.current;
    if (!owned) return Promise.resolve();
    if (!owned.closing) {
      const epoch = this.epoch;
      // Register the one cleanup debt before close can throw or reenter invalidate/shutdown.
      owned.closing = Promise.resolve().then(async () => {
        const errors: unknown[] = [];
        designProgress("host", epoch, "close");
        try { owned.session.close(); }
        catch (error) { errors.push(error); }
        try {
          await owned.session.exited;
          designProgress("host", epoch, "exited");
        } catch (error) { errors.push(error); }
        finally {
          // Even a synchronous close failure owes the original exit settlement.
          if (this.current === owned) {
            this.current = undefined;
            this.terminalId = owned.session.id;
          }
        }
        if (errors.length) {
          designProgress("host", epoch, "failed");
          throw errors.length === 1 ? errors[0] : new AggregateError(errors, "关闭设计失败");
        }
      });
    }
    return owned.closing;
  }
  private invalidate(): void {
    this.epoch++;
    designProgress("host", this.epoch, "release");
    this.frame = undefined;
    this.choice = undefined;
    void this.closeCurrent().catch((error: unknown) =>
      console.error("Document cleanup failed", error),
    );
  }
  shutdown(): Promise<void> {
    if (this.shutdownTask) return this.shutdownTask;
    designProgress("host", this.epoch, "shutdown");
    this.disposed = true;
    this.epoch++;
    this.frame = undefined;
    this.choice = undefined;
    for (const channel of Object.values(channels)) ipcMain.removeHandler(channel);
    this.shutdownTask = this.closeCurrent();
    return this.shutdownTask;
  }
}
