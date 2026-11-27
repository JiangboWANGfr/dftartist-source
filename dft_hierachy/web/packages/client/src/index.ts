import { PROTOCOL_VERSION } from "@hier/protocol-types";

/** L5. Typed client over a transport; knows nothing about views. */
export const CLIENT_PROTOCOL_VERSION = PROTOCOL_VERSION;
export { HierClient } from "./client.js";
export type { ClientOptions, Reply, PageReq } from "./client.js";
export { HierError, isHierError } from "./errors.js";
export type { ClientErrorCode } from "./errors.js";
export type { Transport, Unsubscribe } from "./transport.js";
