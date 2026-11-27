/** App-private stage diagnostics. Never include filenames, RTL, tokens or error payloads. */
const prefix = "[hier-demo-design] ";
const stages = [
  "pick", "picked", "picker-cancelled", "detach", "open", "spawn", "connected",
  "hello", "diagnostics", "diagnosed", "mount", "ready", "failed", "stale",
  "close", "closed", "exited", "cancelled", "release", "shutdown", "transport-closed",
] as const;
type Stage = typeof stages[number];
export function designProgress(
  scope: "renderer" | "host", generation: number, stage: Stage,
): void {
  console.info(prefix + JSON.stringify({ scope, generation, stage }));
}

/** Only canonical, bounded renderer records may be forwarded by the approved frame. */
export function rendererProgress(message: string): string | undefined {
  if (message.length > 256 || !message.startsWith(prefix)) return;
  try {
    const value: unknown = JSON.parse(message.slice(prefix.length));
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const fields = value as Record<string, unknown>;
    if (
      Object.keys(fields).length !== 3 || fields.scope !== "renderer" ||
      !Number.isSafeInteger(fields.generation) || (fields.generation as number) < 0 ||
      !stages.some((stage) => stage === fields.stage)
    ) return;
    return prefix + JSON.stringify({
      scope: fields.scope, generation: fields.generation, stage: fields.stage,
    });
  } catch {
    // Arbitrary console text is not part of the diagnostic format.
    return;
  }
}
