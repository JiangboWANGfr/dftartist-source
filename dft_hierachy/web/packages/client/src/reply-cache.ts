import { utf8ByteLength } from "./utf8-byte-length.js";

/** Entries are immutable snapshots; accounting is wire JSON UTF-8, not JS heap. */
export class ReplyCache<T> {
  private readonly entries = new Map<string, { value: T; bytes: number }>();
  private bytes = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxBytes: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  put(key: string, value: T): void {
    if (!this.maxEntries || !this.maxBytes) return;
    const bytes = utf8ByteLength(key) + utf8ByteLength(JSON.stringify(value));
    if (bytes > this.maxBytes) return;
    const old = this.entries.get(key);
    if (old) {
      this.bytes -= old.bytes;
      this.entries.delete(key);
    }
    this.entries.set(key, { value, bytes });
    this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }
}
