// B-owned compile-only shape derived from DESIGN 6.15.1; not an implementation.
import type { ReactElement } from "react";
import type { SourceDocument, SourceDocumentState } from "@hier/viewmodel";

export interface SourceViewPositionFailure {
  readonly document: SourceDocument;
  readonly utf16Offset: number;
  readonly error: unknown;
}

export interface SourceViewPositionQuery {
  readonly locate: (
    document: SourceDocument,
    utf16Offset: number,
  ) => Promise<void>;
  readonly onError: (failure: SourceViewPositionFailure) => void;
}

export interface SourceViewProps {
  readonly state: SourceDocumentState;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
  readonly positionQuery?: SourceViewPositionQuery;
}

export declare function SourceView(props: SourceViewProps): ReactElement;
export declare const VIEWS_PROTOCOL_VERSION: 2;
