// Isolated proposal for DESIGN 6.16. Not a production export or a replacement DTO.
import type { SourceHit as ExistingSourceHit } from "@hier/protocol-types";

export type SourceRefKind = "definition" | "object";
export interface SourceHit extends ExistingSourceHit {
  refKind?: SourceRefKind;
}
