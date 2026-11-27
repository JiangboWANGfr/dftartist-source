/** Compile-only proposal. Not a production export. DESIGN section 6.14. */
import type { ReactElement } from "react";
import type { SourceDocumentState } from "@hier/viewmodel";

export interface SourceViewProps {
  /** Borrowed published value; the host owns the model and subscription. */
  readonly state: SourceDocumentState;
  /** Required nonblank accessible name. No default source path inference. */
  readonly ariaLabel: string;
  /** Finite, positive height of this component in CSS pixels. */
  readonly height: number;
  /** Omit or pass a primitive string; explicit undefined throws TypeError. */
  readonly className?: string;
}

export declare function SourceView(props: SourceViewProps): ReactElement;
