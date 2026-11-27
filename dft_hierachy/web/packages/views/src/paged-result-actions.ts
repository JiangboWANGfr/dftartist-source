/** Structural access to original L6 pages; no copied query or result storage. */
export interface ResultPage {
  readonly result: {
    readonly items: readonly unknown[];
    readonly next?: string;
  };
  readonly completeness: {
    readonly status: "complete" | "partial";
    readonly reasons: readonly {
      readonly code: string;
      readonly at?: string;
      readonly detail?: string;
    }[];
  };
}

export interface PagedResultState<Page extends ResultPage> {
  readonly status: "idle" | "pending" | "success" | "failed" | "cancelled";
  readonly query: unknown | null;
  readonly pages: readonly Page[];
  readonly error?: {
    readonly origin: string;
    readonly code: string;
    readonly message: string;
    readonly dataIssue?: unknown;
  };
}

export type PageAction<Page extends ResultPage> =
  | { readonly command: "loadMore" | "reload" | "cancel" }
  | {
      readonly command: "select";
      readonly page: Page;
      readonly itemIndex: number;
    };

export function canLoadMore(state: PagedResultState<ResultPage>): boolean {
  return (
    state.status === "success" &&
    state.pages.length > 0 &&
    state.pages.every((page) => page.completeness.status === "complete") &&
    state.pages[state.pages.length - 1]!.result.next !== undefined
  );
}

export function permitsPageAction<Page extends ResultPage>(
  state: PagedResultState<Page>,
  action: PageAction<Page>,
): boolean {
  switch (action.command) {
    case "loadMore":
      return canLoadMore(state);
    case "reload":
      return state.query !== null && state.status !== "pending";
    case "cancel":
      return state.status === "pending";
    case "select":
      return (
        state.status === "success" &&
        state.pages.includes(action.page) &&
        Number.isInteger(action.itemIndex) &&
        action.itemIndex >= 0 &&
        action.itemIndex < action.page.result.items.length
      );
  }
}

export function samePageAction<Page extends ResultPage>(
  left: PageAction<Page>,
  right: PageAction<Page>,
): boolean {
  return (
    left.command === right.command &&
    (left.command !== "select" ||
      (right.command === "select" &&
        left.page === right.page &&
        left.itemIndex === right.itemIndex))
  );
}
