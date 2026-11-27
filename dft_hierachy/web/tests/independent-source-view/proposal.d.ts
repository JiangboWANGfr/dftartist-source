// B-owned compile-only copy of the reviewed public shape, not an implementation.
import type { ReactElement } from "react";
import type { SourceDocumentState } from "@hier/viewmodel";
export interface SourceViewProps {
  readonly state: SourceDocumentState;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
}
export declare function SourceView(props: SourceViewProps): ReactElement;
export declare const VIEWS_PROTOCOL_VERSION: 2;
