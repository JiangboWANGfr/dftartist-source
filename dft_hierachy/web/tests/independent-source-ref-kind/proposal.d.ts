// B compile-only delta from DESIGN 6.16. Reuses real old declarations, not A's
// isolated contract. This file never supplies a runtime validator or selector.
import type {
  SourceHit as OldSourceHit,
  Success,
  WireDefinitions as OldWireDefinitions,
  MethodMap as OldMethodMap,
  MethodName,
  Cursor,
} from "@b26/protocol-base";
export * from "@b26/protocol-base";

export type SourceRefKind = "definition" | "object";
export interface SourceHit extends OldSourceHit {
  refKind?: SourceRefKind;
}
export interface SourceResolveResult {
  items: SourceHit[];
  next?: Cursor;
  [extension: string]: unknown;
}
export type SourceHitPage = SourceResolveResult;
export type SourceResolveResponse = Success & {
  result?: SourceResolveResult;
  [extension: string]: unknown;
};
export type WireDefinitions = Omit<
  OldWireDefinitions,
  | "SourceRefKind"
  | "SourceHit"
  | "SourceHitPage"
  | "SourceResolveResult"
  | "SourceResolveResponse"
> & {
  SourceRefKind: SourceRefKind;
  SourceHit: SourceHit;
  SourceHitPage: SourceHitPage;
  SourceResolveResult: SourceResolveResult;
  SourceResolveResponse: SourceResolveResponse;
};
export type MethodMap = {
  [M in keyof OldMethodMap]: M extends "source.resolve"
    ? {
        params: OldMethodMap[M]["params"];
        result: SourceResolveResult;
      }
    : OldMethodMap[M];
};
export type ResultOf<M extends MethodName> = MethodMap[M]["result"];
export declare function validateDefinition<N extends keyof WireDefinitions>(
  name: N,
  value: unknown,
): value is WireDefinitions[N];
