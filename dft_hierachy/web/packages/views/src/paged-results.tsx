import {
  useId,
  useLayoutEffect,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";
import { useInspectorButtons } from "./inspector-buttons.js";
import {
  canLoadMore,
  samePageAction,
  type PageAction,
  type PagedResultState,
  type ResultPage,
} from "./paged-result-actions.js";

interface PagedResultsProps<Page extends ResultPage> {
  readonly session: object;
  readonly state: PagedResultState<Page>;
  readonly invoke: (action: PageAction<Page>) => void;
  readonly failed: boolean;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className: string | undefined;
  readonly cssPrefix: string;
  readonly labels: {
    readonly title: string;
    readonly idle: string;
    readonly pending: string;
    readonly failed: string;
    readonly cancelled: string;
    readonly cancel: string;
    readonly reload: string;
    readonly exhausted: string;
    readonly empty: string;
    readonly emptyMore: string;
    readonly emptyPartial: string;
  };
  readonly query: ReactNode;
  readonly columns: readonly string[];
  readonly rows: (
    page: Page,
    button: (label: string, action: PageAction<Page>) => ReactElement,
  ) => ReactNode;
}

/** Original page identity, status and native table layout for paged result views. */
export function PagedResults<Page extends ResultPage>(
  props: PagedResultsProps<Page>,
): ReactElement {
  const { session, state, labels, cssPrefix } = props;
  const { region, button, onBlurCapture } = useInspectorButtons(
    session,
    state,
    props.invoke,
    samePageAction<Page>,
  );
  const id = useId();
  const pageKey = useMemo(() => {
    const keys = new WeakMap<Page, number>();
    let next = 0;
    return (page: Page): number => {
      let key = keys.get(page);
      if (key === undefined) keys.set(page, (key = next++));
      return key;
    };
  }, []);
  useLayoutEffect(() => {
    region.current?.scrollTo({ top: 0, left: 0 });
  }, [session, region]);

  const { query, pages } = state;
  const count = pages.reduce((sum, page) => sum + page.result.items.length, 0);
  const partial = pages.some((page) => page.completeness.status === "partial");
  const exhausted =
    state.status === "success" &&
    pages.length > 0 &&
    !partial &&
    pages[pages.length - 1]!.result.next === undefined;
  const more = canLoadMore(state);

  return (
    <section
      ref={region}
      id={`${id}-region`}
      role="region"
      tabIndex={-1}
      aria-label={props.ariaLabel}
      aria-busy={state.status === "pending"}
      className={`${cssPrefix}${props.className ? ` ${props.className}` : ""}`}
      style={{ height: props.height }}
      onBlurCapture={onBlurCapture}
    >
      <header className={`${cssPrefix}__header`}>
        <h2>{labels.title}</h2>
        {state.status === "pending" &&
          button(labels.cancel, { command: "cancel" })}
        {query !== null &&
          state.status !== "pending" &&
          button(labels.reload, { command: "reload" })}
        {more && button("加载更多", { command: "loadMore" })}
      </header>
      <div role="status" aria-live="polite">
        {state.status === "idle" && labels.idle}
        {state.status === "pending" && labels.pending}
        {(state.status === "failed" || state.status === "cancelled") && (
          <>
            <div>
              {state.status === "failed" ? labels.failed : labels.cancelled}
            </div>
            <div>
              {state.error!.origin}: {state.error!.code}: {state.error!.message}
            </div>
            {state.error!.dataIssue && <div>诊断数据读取不完整</div>}
          </>
        )}
        {query !== null && <div>已加载{count}项</div>}
        {partial && <div>结果不完整</div>}
        {exhausted && <div>{labels.exhausted}</div>}
        {count === 0 && (
          <>
            {exhausted && <div>{labels.empty}</div>}
            {partial && <div>{labels.emptyPartial}</div>}
            {more && <div>{labels.emptyMore}</div>}
          </>
        )}
        {props.failed && <div>操作失败</div>}
      </div>
      {query !== null && props.query}
      {pages.map((page, pageIndex) => (
        <div key={pageKey(page)} className={`${cssPrefix}__page`}>
          <h3>第{pageIndex + 1}页</h3>
          <div>完整性：{page.completeness.status}</div>
          <ul>
            {page.completeness.reasons.map((reason, index) => (
              <li key={index}>
                <span>{reason.code}</span>
                {reason.at !== undefined && <span> {reason.at}</span>}
                {reason.detail !== undefined && <span> {reason.detail}</span>}
              </li>
            ))}
          </ul>
          <table>
            <thead>
              <tr>
                {props.columns.map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{props.rows(page, button)}</tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
