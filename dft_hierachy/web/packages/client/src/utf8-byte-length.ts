const chunkUnits = 4096;
let encoder: TextEncoder | undefined;
let encodeInto: TextEncoder["encodeInto"] | undefined;
let scratch: Uint8Array | undefined;

/** Exact TextEncoder length without retaining a full encoded copy of the input. */
export function utf8ByteLength(input = ""): number {
  const text = `${input}`;
  if (!text.length) return 0;
  if (!encoder) {
    encoder = new TextEncoder();
    const method = encoder.encodeInto;
    if (typeof method === "function") encodeInto = method;
  }
  // 4097 UTF-16 units need at most 12291 UTF-8 bytes. The extra unit keeps
  // a surrogate pair together when it crosses the usual chunk boundary.
  const output = encodeInto ? (scratch ??= new Uint8Array(16 * 1024)) : undefined;
  let bytes = 0;
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + chunkUnits, text.length);
    if (end < text.length) {
      const high = text.charCodeAt(end - 1), low = text.charCodeAt(end);
      if (high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff) end++;
    }
    const piece = text.slice(start, end);
    bytes += output
      ? encodeInto!.call(encoder, piece, output).written
      : encoder.encode(piece).byteLength;
    start = end;
  }
  return bytes;
}
