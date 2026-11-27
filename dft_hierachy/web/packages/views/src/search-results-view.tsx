import { useSelectionMembership } from "./selection-membership.js";
import { cloneElement, type ReactElement } from "react";
import { SearchModel, SelectionModel } from "@hier/viewmodel";
import { useSearchResultsCommands } from "./search-results-commands.js";
import { PagedResults } from "./paged-results.js";
import type { SearchResultsViewProps } from "./search-results-view-types.js";

const modelDisposed = Object.getOwnPropertyDescriptor(
  SearchModel.prototype,
  "disposed",
)!.get!;
const modelSnapshot = Object.getOwnPropertyDescriptor(
  SearchModel.prototype,
  "snapshotId",
)!.get!;
const selectionDisposed = Object.getOwnPropertyDescriptor(
  SelectionModel.prototype,
  "disposed",
)!.get!;
const selectionSnapshot = Object.getOwnPropertyDescriptor(
  SelectionModel.prototype,
  "snapshotId",
)!.get!;

function validate(props: SearchResultsViewProps): void {
  if (typeof props.ariaLabel !== "string" || !props.ariaLabel.trim())
    throw new TypeError(
      "SearchResultsView ariaLabel must be a nonblank string",
    );
  if (
    typeof props.height !== "number" ||
    !Number.isFinite(props.height) ||
    props.height <= 0
  )
    throw new TypeError("SearchResultsView height must be finite and positive");
  if (props.className !== undefined && typeof props.className !== "string")
    throw new TypeError("SearchResultsView className must be a string");
  if (
    props.onCommandError !== undefined &&
    typeof props.onCommandError !== "function"
  )
    throw new TypeError("SearchResultsView onCommandError must be a function");
  if (
    modelDisposed.call(props.search) ||
    selectionDisposed.call(props.selection)
  )
    throw new TypeError("SearchResultsView models must be live");
  if (
    modelSnapshot.call(props.search) !== selectionSnapshot.call(props.selection)
  )
    throw new TypeError("SearchResultsView models must share a bound snapshot");
}

export function SearchResultsView(props: SearchResultsViewProps): ReactElement {
  validate(props);
  const view = useSearchResultsCommands(props);
  const { state, selected } = view;
  const membership = useSelectionMembership(selected);
  const { query } = state;
  return (
    <PagedResults
      {...view}
      ariaLabel={props.ariaLabel}
      height={props.height}
      className={props.className}
      cssPrefix="hier-search-results-view"
      labels={{
        title: "搜索结果",
        idle: "尚未执行搜索",
        pending: "正在搜索",
        failed: "搜索失败",
        cancelled: "搜索已取消",
        cancel: "取消搜索",
        reload: "重新搜索",
        exhausted: "已取尽当前查询",
        empty: "未找到匹配",
        emptyMore: "当前已加载页未返回匹配，仍可继续加载",
        emptyPartial: "当前结果未返回匹配（结果不完整）",
      }}
      query={
        query !== null && (
          <dl className="hier-search-results-view__query">
            <dt>搜索文本</dt>
            <dd>{query.text === "" ? "空文本" : query.text}</dd>
            <dt>种类</dt>
            <dd>
              {query.kinds === undefined
                ? "全部种类"
                : query.kinds.length === 0
                  ? "空种类集合"
                  : query.kinds.join(", ")}
            </dd>
            <dt>范围</dt>
            <dd>{query.scope ?? "全部范围"}</dd>
          </dl>
        )
      }
      columns={["种类", "名称", "路径", "引用", "定义", "实例", "选择"]}
      rows={(page, button) =>
        page.result.items.map((hit, itemIndex) => {
          const definition = hit.kind === "definition";
          const marked = definition
            ? membership.definitions.has(hit.ref)
            : membership.objects.has(hit.ref);
          return (
            <tr key={itemIndex}>
              <td>{hit.kind}</td>
              <td>{hit.name}</td>
              <td>{hit.pathText}</td>
              <td>{hit.ref}</td>
              <td>{hit.def}</td>
              <td>{hit.inst ?? "未提供"}</td>
              <td>
                {cloneElement(
                  button(definition ? "选择定义" : "选择对象", {
                    command: "select",
                    page,
                    itemIndex,
                  }),
                  { disabled: state.status !== "success" },
                )}
                {marked && (
                  <span>{definition ? "定义在选择中" : "对象在选择中"}</span>
                )}
              </td>
            </tr>
          );
        })
      }
    />
  );
}
