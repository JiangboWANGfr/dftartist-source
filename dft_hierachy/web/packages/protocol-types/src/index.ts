/** Wire protocol version; must equal kProtocolVersion in core/protocol. */
export * from "./wire.generated.js";
export { PROTOCOL_VERSION, SCHEMA_VERSION, METHODS } from "./registry.generated.js";
export type { MethodMap } from "./registry.generated.js";
export { validateDefinition, canonicalParams } from "./validation.js";
export type { MethodName, ParamsOf, ResultOf } from "./validation.js";
