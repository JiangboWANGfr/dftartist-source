/** Compile-only proposal; DESIGN 6.15. Not a production export. */
import type { ReactElement } from "react";
import type { SourceDocument } from "@hier/viewmodel";
import type { SourceViewProps as ReadonlySourceViewProps } from "@hier/views";

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

/** The existing component gains one optional, explicitly enabled interaction. */
export interface SourceViewProps extends ReadonlySourceViewProps {
  readonly positionQuery?: SourceViewPositionQuery;
}

export declare function SourceView(props: SourceViewProps): ReactElement;
