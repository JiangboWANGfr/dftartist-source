import type { HierClient } from "@hier/client";

export type Compilation = Awaited<ReturnType<HierClient["diagnostics"]>>;

const unreadable = "无法读取原始显示错误；详细原因已记录";

function inspectionFailure(value: unknown, error: unknown): string {
  console.error("Design diagnostic inspection failed", new AggregateError([value, error]));
  return unreadable;
}
function diagnosticText(value: unknown, owner: unknown): string {
  try {
    return String(value);
  } catch (error) {
    return inspectionFailure(owner, error);
  }
}
function diagnosticField(
  value: object,
  key: string,
): {
  readonly present: boolean;
  readonly value?: unknown;
  readonly failure?: string;
} {
  try {
    return key in value ? { present: true, value: Reflect.get(value, key) } : { present: false };
  } catch (error) {
    return { present: false, failure: inspectionFailure(value, error) };
  }
}

/** Preserve the original depth-first text without relying on the JavaScript call stack. */
export function diagnostic(error: unknown, seen = new Set<unknown>()): string {
  const pending: unknown[] = [error],
    lines: string[] = [];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") {
      lines.push(diagnosticText(value, value));
      continue;
    }
    const message = diagnosticField(value, "message");
    if (!message.present && message.failure === undefined) {
      lines.push(diagnosticText(value, value));
      continue;
    }
    const code = diagnosticField(value, "code");
    const prefix =
      code.failure !== undefined
        ? code.failure + "\n"
        : code.present
          ? diagnosticText(code.value, value) + ": "
          : "";
    lines.push(prefix + (message.failure ?? diagnosticText(message.value, value)));
    if (seen.has(value)) continue;
    seen.add(value);
    const causes: unknown[] = [];
    try {
      if (value instanceof AggregateError) {
        const errors = diagnosticField(value, "errors");
        if (errors.failure !== undefined) causes.push(errors.failure);
        else {
          // Keep already-read leaves if a foreign iterator fails partway through.
          try {
            for (const cause of errors.value as Iterable<unknown>) causes.push(cause);
          } catch (error) {
            causes.push(inspectionFailure(value, error));
          }
        }
      }
    } catch (error) {
      causes.push(inspectionFailure(value, error));
    }
    const cause = diagnosticField(value, "cause");
    if (cause.failure !== undefined) causes.push(cause.failure);
    else if (cause.present && cause.value !== undefined) causes.push(cause.value);
    for (let index = causes.length - 1; index >= 0; index--) pending.push(causes[index]);
  }
  return lines.join("\n");
}

export function compilationSummary(reply: Compilation): string {
  const { errorCount, warningCount, items } = reply.result;
  const first = items.find((item) => item.severity === "error");
  return (
    `编译失败：${errorCount} 个错误，${warningCount} 个警告` +
    (first === undefined ? "" : "\n" + first.message)
  );
}
