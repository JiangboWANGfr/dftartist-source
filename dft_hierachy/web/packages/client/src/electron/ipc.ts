/** Private wire names. Only named bridge capabilities are exposed to the renderer. */
export const channels = {
  connect: "hier:bridge:connect",
  start: "hier:bridge:start",
  send: "hier:bridge:send",
  close: "hier:bridge:close",
  event: "hier:bridge:event",
} as const;

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
