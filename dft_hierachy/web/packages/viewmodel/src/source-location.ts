import type { ResultOf } from "@hier/protocol-types";
import { SourceDocumentError } from "./source-document-types.js";
import type {
  SourceDocumentLocation,
  SourceTextPosition,
} from "./source-document-types.js";

function inconsistent(message: string): never {
  throw new SourceDocumentError("inconsistent_reply", message);
}

/** Visit every scalar/CRLF boundary, including EOF, without retaining an index. */
function scanSourceText(
  text: string,
  visit: (
    textOffset: number,
    byteOffset: number,
    line: number,
    textColumn: number,
    byteColumn: number,
  ) => void,
): void {
  let byteOffset = 0;
  let textOffset = 0;
  let line = 1;
  let byteColumn = 1;
  let textColumn = 1;
  for (;;) {
    visit(textOffset, byteOffset, line, textColumn, byteColumn);
    if (textOffset === text.length) break;

    const scalar = text.codePointAt(textOffset)!;
    if (scalar >= 0xd800 && scalar <= 0xdfff)
      inconsistent("Source text contains an incomplete Unicode scalar");

    const crlf = scalar === 0x0d && text.charCodeAt(textOffset + 1) === 0x0a;
    const units = crlf || scalar > 0xffff ? 2 : 1;
    const bytes = crlf
      ? 2
      : scalar <= 0x7f
        ? 1
        : scalar <= 0x7ff
          ? 2
          : scalar <= 0xffff
            ? 3
            : 4;
    byteOffset += bytes;
    textOffset += units;
    if (scalar === 0x0d || scalar === 0x0a) {
      line += 1;
      byteColumn = 1;
      textColumn = 1;
    } else {
      byteColumn += bytes;
      textColumn += units;
    }
  }
}

/** Project validated Core replies without changing their text or coordinates. */
export function projectSourceLocation(
  span: ResultOf<"obj.source">,
  read: ResultOf<"source.read">,
): SourceDocumentLocation {
  if (span.start.offset > span.end.offset)
    inconsistent("Source range starts after its end");
  if (read.matchesSnapshot !== (read.contentHash === span.contentHash))
    inconsistent("Source snapshot flag and content hashes disagree");
  // Snapshot coordinates do not describe changed text, including empty text.
  if (!read.matchesSnapshot) return Object.freeze({ status: "changed" });

  let start: SourceTextPosition | undefined;
  let end: SourceTextPosition | undefined;
  const position = (
    source: ResultOf<"obj.source">["start"],
    textOffset: number,
    line: number,
    textColumn: number,
    byteColumn: number,
  ): SourceTextPosition => {
    if (source.line !== line || source.column !== byteColumn)
      inconsistent("Source line and byte column do not match its offset");
    return Object.freeze({ offset: textOffset, line, column: textColumn });
  };

  // Continue through EOF even after finding both endpoints: trailing malformed
  // scalars must still reject the document before it can become current.
  scanSourceText(
    read.text,
    (textOffset, byteOffset, line, textColumn, byteColumn) => {
      if (span.start.offset === byteOffset)
        start = position(span.start, textOffset, line, textColumn, byteColumn);
      if (span.end.offset === byteOffset)
        end = position(span.end, textOffset, line, textColumn, byteColumn);
    },
  );

  if (start === undefined || end === undefined)
    inconsistent(
      "Source endpoint is outside the text or splits a scalar or CRLF",
    );
  return Object.freeze({
    status: "exact",
    range: Object.freeze({ start, end }),
  });
}

/** Map a boundary in already validated exact document text; interiors miss. */
export function projectSourcePoint(
  text: string,
  utf16Offset: number,
): { line: number; col: number } | undefined {
  let point: { line: number; col: number } | undefined;
  scanSourceText(
    text,
    (textOffset, _byteOffset, line, _textColumn, byteColumn) => {
      if (textOffset === utf16Offset) point = { line, col: byteColumn };
    },
  );
  return point;
}
