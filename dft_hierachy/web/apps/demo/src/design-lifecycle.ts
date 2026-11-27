import { HierClient, type Transport } from "@hier/client";
import { connectElectronTransport, type ElectronBridge } from "@hier/client/electron/renderer";
import type { DemoBridge, DemoPickOptions, DemoReply } from "./bridge.js";
import { DesignPanels } from "./design-panels.js";
import { designProgress } from "./design-progress.js";
import { diagnostic, compilationSummary, type Compilation } from "./design-diagnostic.js";
import { DesignInputs } from "./design-inputs.js";
export { diagnostic } from "./design-diagnostic.js";

export type Phase =
  "idle" | "picking" | "closing" | "opening" | "connecting" | "ready" | "failed" | "cancelled";
interface Session {
  readonly id: string;
  readonly label: string;
  transport?: Transport;
  client?: HierClient;
  panels?: DesignPanels;
  inputs?: DesignInputs;
  closed?: string;
  unsubscribeClose?: () => void;
}
interface LostSession {
  readonly session: Session;
  readonly kind: "connection" | "workspace";
  readonly reason: string;
  readonly errors: unknown[];
  closing?: Promise<void>;
}
function unwrap<T>(reply: DemoReply<T>): T {
  if (!reply.ok) throw reply.error;
  return reply.value;
}
function dispose(session: Session | undefined): unknown[] {
  const errors: unknown[] = [];
  for (const release of [
    () => session?.unsubscribeClose?.(),
    () => session?.inputs?.dispose(),
    () => session?.panels?.dispose(),
    () => {
      if (session?.client) session.client.dispose();
      else session?.transport?.close();
    },
  ]) {
    try {
      release();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}
interface DesignState {
  readonly phase: Phase;
  readonly message: string;
  readonly operationMessage: string | undefined;
  readonly active: Session | undefined;
  readonly compilation: Compilation | undefined;
}
/** Owns the renderer's session; views only borrow its published models. */
export class DesignLifecycle {
  private snapshot: DesignState = Object.freeze({
    phase: "idle",
    message: "选择 HDL 文件或文件列表开始",
    operationMessage: undefined,
    active: undefined,
    compilation: undefined,
  });
  private readonly listeners = new Set<() => void>();
  private owned: Session | undefined;
  /** Mutually exclusive with owned: local resources released, main cleanup still owed. */
  private lost: LostSession | undefined;
  private generation = 0;
  private busy = false;
  private released = false;
  constructor(
    private readonly demo: DemoBridge,
    private readonly electron: ElectronBridge,
    private readonly commitDetach: (change: () => void) => void,
    private readonly connect: typeof connectElectronTransport = connectElectronTransport,
  ) {}
  readonly getSnapshot = (): DesignState => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.released) return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(change: Partial<DesignState>): void {
    if (this.released) return;
    this.snapshot = Object.freeze({ ...this.snapshot, ...change });
    const published = this.snapshot;
    for (const listener of [...this.listeners]) {
      if (this.released || this.snapshot !== published) break;
      if (this.listeners.has(listener)) listener();
    }
  }
  private current(turn: number): boolean {
    return !this.released && turn === this.generation;
  }
  /** A notification may synchronously release or replace this operation. */
  private enterPhase(turn: number, phase: Phase, message: string): boolean {
    if (!this.current(turn)) return false;
    this.publish({ phase, message });
    return this.current(turn);
  }
  private setOperationMessage(operationMessage: string | undefined): void {
    this.publish({ operationMessage });
  }
  dismissOperationMessage(): void { this.setOperationMessage(undefined); }
  private detach(): { session: Session | undefined; errors: unknown[] } {
    const old = this.owned;
    // Revoke command/callback authority before a synchronous view-unmount notification.
    this.owned = undefined;
    designProgress("renderer", this.generation, "detach");
    const errors: unknown[] = [];
    try {
      this.commitDetach(() => this.publish({
        active: undefined, operationMessage: undefined, compilation: undefined,
      }));
    } catch (error) { errors.push(error); }
    errors.push(...dispose(old));
    return { session: old, errors };
  }
  private lossMessage(loss: LostSession): string {
    return [
      (loss.kind === "workspace" ? "工作区显示失败：" : "连接已关闭：") + loss.reason,
      ...loss.errors.map((error) => "清理失败：" + diagnostic(error)),
    ].join("\n");
  }
  private cleanupMessage(loss: LostSession): string {
    return loss.kind === "workspace" ? "正在清理显示失败的设计" : "正在清理已断开的设计";
  }
  private connectionLost(owner: Session): void {
    this.invalidateSession(owner, "connection", owner.closed!);
  }
  /** Only the boundary of this exact workspace may withdraw its borrowed models. */
  workspaceFailed(sessionId: string, error: unknown): void {
    const owner = this.owned;
    if (this.released || owner?.id !== sessionId || !owner.panels) {
      console.debug("Released workspace rendering settled", error);
      return;
    }
    this.invalidateSession(owner, "workspace", diagnostic(error));
  }
  /** Withdraw local borrowers, then settle the one main-process cleanup debt. */
  private invalidateSession(owner: Session, kind: LostSession["kind"], reason: string): void {
    if (this.released || this.owned !== owner || !owner.panels) return;
    const pendingOperation = this.busy;
    this.busy = true;
    const { errors } = this.detach();
    if (this.released) {
      for (const error of errors) console.error("Released session cleanup failed", error);
      return;
    }
    const loss: LostSession = { session: owner, kind, reason, errors };
    this.lost = loss;
    if (pendingOperation) {
      // In particular, main may still own the native picker. Do not send a
      // concurrent close; the current operation drains this record when it settles.
      this.publish({ message: kind === "workspace"
        ? "工作区显示失败，等待当前操作结束后清理"
        : "连接已中断，等待当前操作结束后清理" });
      return;
    }
    const turn = ++this.generation;
    void this.recoverLost(loss, turn)
      .finally(() => { if (turn === this.generation) this.busy = false; })
      .catch((error: unknown) => console.error("Invalidated design cleanup failed", error));
  }
  private async settleLost(loss: LostSession): Promise<void> {
    if (!loss.closing) {
      loss.closing = (async () => {
        designProgress("renderer", this.generation, "close");
        try {
          unwrap(await this.demo.closeDesign(loss.session.id));
          designProgress("renderer", this.generation, "closed");
        } catch (error) {
          loss.errors.push(error);
          if (this.released) console.error("Released session cleanup failed", error);
        }
      })();
    }
    await loss.closing;
    if (this.lost === loss) this.lost = undefined;
  }
  private async recoverLost(loss: LostSession, turn: number): Promise<void> {
    if (!this.enterPhase(turn, "closing", this.cleanupMessage(loss))) return;
    await this.settleLost(loss);
    if (turn === this.generation && !this.released) {
      this.busy = false;
      designProgress("renderer", turn, "failed");
      const message = this.lossMessage(loss);
      if (this.current(turn)) this.publish({ phase: "failed", message });
    }
  }
  releaseDocument(): void {
    if (this.released) return;
    this.released = true;
    this.generation++;
    designProgress("renderer", this.generation, "release");
    const old = this.owned;
    this.owned = undefined;
    for (const error of this.lost?.errors ?? []) console.error("Document cleanup failed", error);
    this.lost = undefined; // Main independently reaps the document's session.
    this.busy = false;
    // Final document teardown has no live view to notify. Do not retain disposed
    // models or callbacks through the last published snapshot.
    this.snapshot = Object.freeze({
      ...this.snapshot, active: undefined, compilation: undefined, operationMessage: undefined,
    });
    this.listeners.clear();
    for (const error of dispose(old)) console.error("Document cleanup failed", error);
  }
  async open(options: DemoPickOptions): Promise<void> {
    if (this.busy || this.released) return;
    this.busy = true;
    const turn = ++this.generation;
    let opening: Session | undefined;
    let compilation: Compilation | undefined;
    let priorFailure: string | undefined;
    try {
      if (!this.enterPhase(turn, "picking", "选择中")) return;
      designProgress("renderer", turn, "pick");
      const choice = unwrap(await this.demo.pickDesign(options));
      if (turn !== this.generation) return;
      const loss = this.lost;
      if (loss) {
        this.publish({ phase: "closing", message: this.cleanupMessage(loss) });
        await this.settleLost(loss);
        if (turn !== this.generation) return;
        if (!choice || loss.errors.length) throw new Error(this.lossMessage(loss));
        priorFailure = this.lossMessage(loss);
      }
      if (!choice) {
        designProgress("renderer", turn, "picker-cancelled");
        this.enterPhase(turn, this.owned ? "ready" : "cancelled", "已取消选择");
        return;
      }
      designProgress("renderer", turn, "picked");
      const previous = this.detach();
      if (!this.current(turn)) {
        for (const error of previous.errors) console.error("Released session cleanup failed", error);
        return;
      }
      if (previous.errors.length) {
        // A failed local release must still await main's process cleanup before allowing retry.
        this.publish({ phase: "closing", message: "正在清理旧设计" });
        if (previous.session) {
          try {
            unwrap(await this.demo.closeDesign(previous.session.id));
          } catch (error) {
            previous.errors.push(error);
          }
        }
        throw new AggregateError(previous.errors, "关闭旧设计失败");
      }
      if (!this.enterPhase(turn, "opening", "关闭旧设计并打开 " + choice.label)) return;
      designProgress("renderer", turn, "open");
      const session = unwrap(await this.demo.openDesign(choice.token));
      opening = { id: session.sessionId, label: session.label };
      if (turn !== this.generation) {
        unwrap(await this.demo.closeDesign(opening.id));
        return;
      }
      this.owned = opening;
      if (!this.enterPhase(turn, "connecting", "连接中：" + opening.label)) return;
      const transport = await this.connect(this.electron);
      if (turn !== this.generation) {
        transport.close();
        return;
      }
      opening.transport = transport;
      designProgress("renderer", turn, "connected");
      const client = new HierClient(transport);
      opening.client = client;
      const owner = opening;
      owner.unsubscribeClose = transport.onClose((error) => {
        if (this.owned !== owner) return;
        designProgress("renderer", turn, "transport-closed");
        const reason = diagnostic(
          error ?? { code: "transport_closed", message: "Core session closed" },
        );
        if (this.owned !== owner || this.released) return;
        owner.closed = reason;
        // Handshake/diagnostic failures stay in the awaiting open operation;
        // an established session revokes all borrowed views immediately.
        this.connectionLost(owner);
      });
      await client.ready;
      if (turn !== this.generation) return;
      if (owner.closed !== undefined) throw new Error(owner.closed);
      designProgress("renderer", turn, "hello");
      // A nonempty top list can also contain semantic errors. Core remains the
      // authority; no models are published until its diagnostic request succeeds.
      designProgress("renderer", turn, "diagnostics");
      const diagnostics = await client.diagnostics({ maxItems: 100 });
      if (turn !== this.generation) return;
      if (owner.closed !== undefined) throw new Error(owner.closed);
      designProgress("renderer", turn, "diagnosed");
      compilation = diagnostics;
      if (diagnostics.result.errorCount > 0) {
        throw new Error(compilationSummary(diagnostics));
      }
      designProgress("renderer", turn, "mount");
      const panels = new DesignPanels(client, (error, current) => {
        if (this.owned !== opening || !current()) { console.debug("Released session diagnostic", error); return; }
        const message = diagnostic(error);
        if (this.owned === opening && !this.released && current()) this.setOperationMessage(message);
        else console.debug("Released session diagnostic", error);
      });
      opening.panels = panels;
      opening.inputs = new DesignInputs(client);
      this.publish({
        active: opening, phase: "ready", message: "已打开：" + opening.label, compilation,
        operationMessage: priorFailure,
      });
      if (!this.current(turn) || this.owned !== opening) return;
      designProgress("renderer", turn, "ready");
      panels.consume(panels.tree.loadRoots());
    } catch (error) {
      if (turn !== this.generation) {
        designProgress("renderer", turn, "stale");
        console.debug("Superseded open settled", error);
        return;
      }
      const message = diagnostic(error);
      if (!this.current(turn)) { console.debug("Superseded open diagnostic", error); return; }
      const messages = [message];
      designProgress("renderer", turn, "failed");
      const loss = this.lost;
      if (loss) {
        this.publish({ phase: "closing", message: this.cleanupMessage(loss) });
        await this.settleLost(loss);
        if (turn !== this.generation) return;
        messages.push(this.lossMessage(loss));
      }
      // Picker failure keeps the old, still readable design. Failed replacement does not revive it.
      if (opening && loss?.session !== opening) {
        // Publish the terminal error together with retry availability, after reaping.
        this.publish({ phase: "closing", message: "正在清理设计，请稍候" });
        const { errors } = this.detach();
        messages.push(...errors.map((cleanup) => "清理失败：" + diagnostic(cleanup)));
        try {
          designProgress("renderer", turn, "close");
          unwrap(await this.demo.closeDesign(opening.id));
          designProgress("renderer", turn, "closed");
        } catch (cleanup) {
          messages.push("清理失败：" + diagnostic(cleanup));
          if (!this.current(turn)) console.error("Released session cleanup failed", cleanup);
        }
      }
      if (turn === this.generation) {
        this.publish({
          phase: "failed", message: messages.join("\n"),
          compilation: compilation ?? this.snapshot.compilation,
        });
      } else console.debug("Superseded open cleanup settled", error);
    } finally {
      if (turn === this.generation) {
        if (this.lost) await this.recoverLost(this.lost, turn);
        if (turn === this.generation) this.busy = false;
      }
    }
  }
  async close(cancel: boolean): Promise<void> {
    if (this.released) return;
    if (this.busy && !cancel) return;
    const old = this.owned;
    if (!old) return;
    const turn = ++this.generation;
    this.busy = true;
    const { errors } = this.detach();
    this.publish({ phase: "closing", message: cancel ? "正在取消打开" : "关闭中" });
    designProgress("renderer", turn, "close");
    try {
      unwrap(await this.demo.closeDesign(old.id));
    } catch (error) {
      errors.push(error);
    } finally {
      if (turn === this.generation) {
        this.busy = false;
        if (errors.length) {
          const message = diagnostic(new AggregateError(errors, "关闭设计失败"));
          if (this.current(turn)) this.publish({ phase: "failed", message });
        } else {
          designProgress("renderer", turn, cancel ? "cancelled" : "closed");
          this.publish({ phase: cancel ? "cancelled" : "idle", message: cancel ? "已取消打开" : "设计已关闭" });
        }
      } else for (const error of errors) console.error("Released session cleanup failed", error);
    }
  }
}
