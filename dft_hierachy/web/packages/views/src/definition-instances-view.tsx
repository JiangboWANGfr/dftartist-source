import { useSelectionMembership } from "./selection-membership.js";
import { cloneElement, type ReactElement } from "react";
import { DefinitionInstancesModel, SelectionModel } from "@hier/viewmodel";
import { useDefinitionInstancesCommands } from "./definition-instances-commands.js";
import { PagedResults } from "./paged-results.js";
import type { DefinitionInstancesViewProps } from "./definition-instances-view-types.js";

const modelDisposed = Object.getOwnPropertyDescriptor(
  DefinitionInstancesModel.prototype,
  "disposed",
)!.get!;
const modelSnapshot = Object.getOwnPropertyDescriptor(
  DefinitionInstancesModel.prototype,
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

function validate(props: DefinitionInstancesViewProps): void {
  if (typeof props.ariaLabel !== "string" || !props.ariaLabel.trim())
    throw new TypeError(
      "DefinitionInstancesView ariaLabel must be a nonblank string",
    );
  if (
    typeof props.height !== "number" ||
    !Number.isFinite(props.height) ||
    props.height <= 0
  )
    throw new TypeError(
      "DefinitionInstancesView height must be finite and positive",
    );
  if (props.className !== undefined && typeof props.className !== "string")
    throw new TypeError("DefinitionInstancesView className must be a string");
  if (
    props.onCommandError !== undefined &&
    typeof props.onCommandError !== "function"
  )
    throw new TypeError(
      "DefinitionInstancesView onCommandError must be a function",
    );
  if (
    modelDisposed.call(props.instances) ||
    selectionDisposed.call(props.selection)
  )
    throw new TypeError("DefinitionInstancesView models must be live");
  if (
    modelSnapshot.call(props.instances) !==
    selectionSnapshot.call(props.selection)
  )
    throw new TypeError(
      "DefinitionInstancesView models must share a bound snapshot",
    );
}

export function DefinitionInstancesView(
  props: DefinitionInstancesViewProps,
): ReactElement {
  validate(props);
  const view = useDefinitionInstancesCommands(props);
  const { state, selected } = view;
  const { objects: selectedRefs } = useSelectionMembership(selected);
  const { query } = state;
  return (
    <PagedResults
      {...view}
      ariaLabel={props.ariaLabel}
      height={props.height}
      className={props.className}
      cssPrefix="hier-definition-instances-view"
      labels={{
        title: "定义实例",
        idle: "尚未查询定义实例",
        pending: "正在查询定义实例",
        failed: "定义实例查询失败",
        cancelled: "定义实例查询已取消",
        cancel: "取消查询",
        reload: "重新查询",
        exhausted: "已取尽当前定义实例",
        empty: "该定义没有实例",
        emptyMore: "当前已加载页未返回实例，仍可继续加载",
        emptyPartial: "当前结果未返回实例（结果不完整）",
      }}
      query={
        query !== null && (
          <dl className="hier-definition-instances-view__query">
            <dt>定义引用</dt>
            <dd>{query.def}</dd>
          </dl>
        )
      }
      columns={[
        "种类",
        "名称",
        "路径",
        "路径分段",
        "引用",
        "定义",
        "定义名称",
        "子实例数",
        "参数覆盖",
        "选择",
      ]}
      rows={(page, button) =>
        page.result.items.map((occurrence, itemIndex) => (
          <tr key={itemIndex}>
            <td>{occurrence.kind}</td>
            <td>{occurrence.name}</td>
            <td>{occurrence.pathText}</td>
            <td>
              <ul>
                {occurrence.path.map((segment, index) => (
                  <li key={index}>{segment}</li>
                ))}
              </ul>
            </td>
            <td>{occurrence.ref}</td>
            <td>{occurrence.def}</td>
            <td>{occurrence.defName}</td>
            <td>{occurrence.childCount}</td>
            <td>{occurrence.hasParamOverrides ? "是" : "否"}</td>
            <td>
              {cloneElement(
                button("选择实例", { command: "select", page, itemIndex }),
                { disabled: state.status !== "success" },
              )}
              {selectedRefs.has(occurrence.ref) && (
                <span>实例在选择中</span>
              )}
            </td>
          </tr>
        ))
      }
    />
  );
}
