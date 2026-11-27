import type { Unsubscribe } from "@hier/client";
import type { SnapshotId } from "@hier/protocol-types";
import {
  readSelection,
  readSelectionOptions,
  sameSelectionItems,
} from "./selection-input.js";
import { SelectionError } from "./selection-types.js";
import type { Selection, SelectionOptions } from "./selection-types.js";

interface Registration {
  listener: ((selection: Selection) => void) | undefined;
}

/** Shared per-design selection state. The host retains ownership of its SDK session. */
export class SelectionModel {
  readonly #snapshotId: SnapshotId | undefined;
  readonly #historyLimit: number;
  readonly #empty: Selection;
  #history: Selection[];
  #position = 0;
  #disposed = false;
  #reading = false;
  #notifying = false;
  readonly #listeners = new Set<Registration>();

  constructor(options?: SelectionOptions) {
    const captured = readSelectionOptions(options);
    this.#snapshotId = captured.snapshotId;
    this.#historyLimit = captured.historyLimit;
    this.#empty = Object.freeze({
      items: Object.freeze([]),
      origin: "external",
      ...(captured.snapshotId === undefined
        ? {}
        : { snapshotId: captured.snapshotId }),
    });
    this.#history = [this.#empty];
  }

  get snapshotId(): SnapshotId | undefined {
    return this.#snapshotId;
  }
  get current(): Selection {
    return this.#history[this.#position] ?? this.#empty;
  }
  get canGoBack(): boolean {
    return this.#position > 0;
  }
  get canGoForward(): boolean {
    return this.#position + 1 < this.#history.length;
  }
  get disposed(): boolean {
    return this.#disposed;
  }

  select(selection: Selection): void {
    this.#assertNavigationEntry();
    let next: Selection;
    this.#reading = true;
    try {
      next = readSelection(selection, () => this.#disposed);
    } finally {
      this.#reading = false;
    }
    if (next.snapshotId !== this.#snapshotId) {
      throw new SelectionError(
        "snapshot_mismatch",
        "Selection belongs to a different snapshot",
      );
    }
    if (sameSelectionItems(this.#history[this.#position]!, next)) return;
    this.#assertNotNotifying();
    this.#history.length = this.#position + 1;
    this.#history.push(next);
    const excess = this.#history.length - this.#historyLimit;
    if (excess > 0) this.#history.splice(0, excess);
    this.#position = this.#history.length - 1;
    this.#publish(next);
  }

  back(): void {
    this.#navigate(-1);
  }
  forward(): void {
    this.#navigate(1);
  }

  subscribe(listener: (selection: Selection) => void): Unsubscribe {
    this.#assertActive();
    if (typeof listener !== "function")
      throw new TypeError("Selection listener must be a function");
    const registration: Registration = { listener };
    this.#listeners.add(registration);
    return () => {
      registration.listener = undefined;
      this.#listeners.delete(registration);
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#history = [];
    this.#position = 0;
    for (const registration of this.#listeners)
      registration.listener = undefined;
    this.#listeners.clear();
  }

  #assertActive(): void {
    if (this.#disposed)
      throw new SelectionError("disposed", "Selection model is disposed");
  }

  #assertNavigationEntry(): void {
    this.#assertActive();
    if (this.#reading)
      throw new SelectionError(
        "reentrant_change",
        "Cannot navigate while reading selection input",
      );
  }

  #assertNotNotifying(): void {
    if (this.#notifying)
      throw new SelectionError(
        "reentrant_change",
        "Cannot change selection while notifying listeners",
      );
  }

  #navigate(delta: number): void {
    this.#assertNavigationEntry();
    const position = this.#position + delta;
    if (position < 0 || position >= this.#history.length) return;
    this.#assertNotNotifying();
    this.#position = position;
    this.#publish(this.#history[position]!);
  }

  #publish(selection: Selection): void {
    const eligible = [...this.#listeners];
    const errors: unknown[] = [];
    this.#notifying = true;
    try {
      for (const registration of eligible) {
        if (this.#disposed) break;
        const listener = registration.listener;
        if (!listener) continue;
        try {
          listener(selection);
        } catch (error) {
          errors.push(error);
        }
      }
    } finally {
      this.#notifying = false;
    }
    if (errors.length)
      throw new AggregateError(errors, "Selection listeners failed");
  }
}
