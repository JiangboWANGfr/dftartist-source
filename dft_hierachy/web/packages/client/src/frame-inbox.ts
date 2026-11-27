import { HierError } from "./errors.js";
import type { Unsubscribe } from "./transport.js";

/** Production inbound queue: binding, bounds and delivery have one owner. */
export class FrameInbox<Frame = unknown> {
  private ownerTaken = false;
  private deliveryStarted = false;
  private closed = false;
  private scheduled = false;
  private receiver: ((message: Frame) => void) | undefined;
  private frames: Frame[] = [];
  private bytes = 0;

  constructor(private readonly overflow: () => void) {}
  get bound(): boolean {
    return this.ownerTaken;
  }

  checkPartial(bytes: number): boolean {
    if (
      !this.closed &&
      !this.deliveryStarted &&
      (this.frames.length > 256 || this.bytes + bytes > 4 * 1024 * 1024)
    ) {
      this.close();
      this.overflow();
    }
    return !this.closed;
  }

  push(frame: Frame, bytes: number): boolean {
    if (this.closed) return false;
    if (!this.ownerTaken || this.receiver) this.frames.push(frame);
    if (!this.deliveryStarted) this.bytes += bytes;
    if (!this.checkPartial(0)) return false;
    this.schedule();
    return true;
  }

  bind(handler: (message: Frame) => void): Unsubscribe {
    if (this.ownerTaken)
      throw new HierError("bad_request", "client", "Transport already has a message receiver");
    this.ownerTaken = true;
    if (!this.closed) this.receiver = handler;
    this.schedule();
    return () => {
      this.receiver = undefined;
      this.frames = [];
    };
  }

  close(): void {
    this.closed = true;
    this.frames = [];
    this.bytes = 0;
    this.receiver = undefined;
  }

  private schedule(): void {
    if (this.scheduled || !this.ownerTaken || this.closed) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.closed) return;
      const frames = this.frames;
      this.frames = [];
      for (const frame of frames) {
        if (this.closed || !this.receiver) break;
        // Binding and an empty flush do not constitute a first delivery.
        this.deliveryStarted = true;
        this.bytes = 0;
        this.receiver(frame);
      }
    });
  }
}
