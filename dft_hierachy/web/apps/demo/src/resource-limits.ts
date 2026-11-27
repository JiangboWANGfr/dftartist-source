import type { ProcessResourceLimits } from "@hier/client/node";

/** User-approved first-release policy for the demo host, not a Node library default. */
export const DEFAULT_RESOURCE_LIMITS: Readonly<Required<ProcessResourceLimits>> = Object.freeze({
  openTimeoutMillis: 30000,
  cancelTimeoutMillis: 2000,
  maxRssBytes: 4294967296,
});

/** Main-process configuration only; renderer IPC never chooses process budgets. */
export function resourceLimitsFromEnvironment(env: NodeJS.ProcessEnv): ProcessResourceLimits {
  const fields = {
    HIER_CORE_OPEN_TIMEOUT_MS: "openTimeoutMillis",
    HIER_CORE_CANCEL_TIMEOUT_MS: "cancelTimeoutMillis",
    HIER_CORE_MAX_RSS_BYTES: "maxRssBytes",
  } as const;
  const limits: ProcessResourceLimits = { ...DEFAULT_RESOURCE_LIMITS };
  for (const [name, key] of Object.entries(fields)) {
    const text = env[name];
    if (text === undefined) continue;
    if (text === "off") {
      delete limits[key];
      continue;
    }
    if (!/^[1-9]\d*$/.test(text))
      throw new Error(`Invalid positive integer configuration: ${name}`);
    const value = Number(text);
    if (!Number.isSafeInteger(value) || (key !== "maxRssBytes" && value > 2147483647))
      throw new Error(`Resource configuration is out of range: ${name}`);
    limits[key] = value;
  }
  return Object.freeze(limits);
}
