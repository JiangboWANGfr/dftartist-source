import { decodeWireFrame } from "../wire-frame.js";

/** Byte framing precedes UTF-8 decoding: a multibyte character may cross reads. */
export class NdjsonReader {
  private chunks: Buffer[] = [];
  private length = 0;
  private lastByte = -1;
  private readonly decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

  get pendingBytes(): number {
    return this.length - (this.lastByte === 13 ? 1 : 0);
  }

  feed(
    chunk: Buffer,
    emit: (frame: unknown, bytes: number, json: string) => boolean,
    partial: () => boolean,
  ): void {
    let start = 0;
    while (start < chunk.length) {
      const lf = chunk.indexOf(10, start);
      const end = lf === -1 ? chunk.length : lf;
      const piece = chunk.subarray(start, end);
      if (piece.length) {
        this.chunks.push(piece);
        this.length += piece.length;
        this.lastByte = piece.at(-1)!;
      }
      if (!partial()) return;
      if (lf === -1) return;
      // Decode synchronously before emit; a complete single-piece frame needs no copy.
      let bytes = this.chunks.length === 1 ? this.chunks[0]! : Buffer.concat(this.chunks, this.length);
      if (bytes.at(-1) === 13) bytes = bytes.subarray(0, -1);
      this.clear();
      const text = this.decoder.decode(bytes);
      const frame = decodeWireFrame(text);
      if (!emit(frame, bytes.length, text)) return;
      start = lf + 1;
    }
  }

  finish(): void {
    if (this.length) throw new SyntaxError("Unterminated NDJSON frame at EOF");
  }
  clear(): void {
    this.chunks = [];
    this.length = 0;
    this.lastByte = -1;
  }
}

export class StderrTail {
  private buffer: Buffer | undefined;
  private length = 0;
  private writeAt = 0;

  append(chunk: Buffer): void {
    const size = 64 * 1024;
    if (!chunk.length) return;
    const buffer = (this.buffer ??= Buffer.allocUnsafe(size));
    if (chunk.length >= size) {
      chunk.copy(buffer, 0, chunk.length - size);
      this.length = size;
      this.writeAt = 0;
      return;
    }
    const first = Math.min(chunk.length, size - this.writeAt);
    chunk.copy(buffer, this.writeAt, 0, first);
    chunk.copy(buffer, 0, first);
    this.writeAt = (this.writeAt + chunk.length) % size;
    this.length = Math.min(size, this.length + chunk.length);
  }

  text(): string {
    const buffer = this.buffer;
    if (!buffer) return "";
    if (this.length < buffer.length) return buffer.subarray(0, this.length).toString("utf8");
    if (!this.writeAt) return buffer.toString("utf8");
    // Reassemble bytes before decoding: a UTF-8 code point may straddle the ring.
    return Buffer.concat([
      buffer.subarray(this.writeAt),
      buffer.subarray(0, this.writeAt),
    ], this.length).toString("utf8");
  }
  get byteLength(): number {
    return this.length;
  }
}
