import { useSelectionMembership } from "./selection-membership.js";
import { useId, type ReactElement } from "react";
import { ObjectConnectionsModel, SelectionModel } from "@hier/viewmodel";
import { useObjectSelectionMatch } from "./object-selection-match.js";
import { useInspectorButtons } from "./inspector-buttons.js";
import {
  useConnectionsCommands,
  queryTargetSelection,
  sameConnectionAction,
} from "./object-connections-commands.js";
import {
  BitCoordinates,
  ConnectionGroup,
} from "./object-connections-fields.js";
import type { ObjectConnectionsViewProps } from "./object-connections-view-types.js";

const modelDisposed = Object.getOwnPropertyDescriptor(
  ObjectConnectionsModel.prototype,
  "disposed",
)!.get!;
const modelSnapshot = Object.getOwnPropertyDescriptor(
  ObjectConnectionsModel.prototype,
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

function validate(props: ObjectConnectionsViewProps): void {
  if (typeof props.ariaLabel !== "string" || !props.ariaLabel.trim())
    throw new TypeError(
      "ObjectConnectionsView ariaLabel must be a nonblank string",
    );
  if (
    typeof props.height !== "number" ||
    !Number.isFinite(props.height) ||
    props.height <= 0
  )
    throw new TypeError(
      "ObjectConnectionsView height must be finite and positive",
    );
  if (props.className !== undefined && typeof props.className !== "string")
    throw new TypeError("ObjectConnectionsView className must be a string");
  if (
    props.onCommandError !== undefined &&
    typeof props.onCommandError !== "function"
  )
    throw new TypeError(
      "ObjectConnectionsView onCommandError must be a function",
    );
  if (
    modelDisposed.call(props.connections) ||
    selectionDisposed.call(props.selection)
  )
    throw new TypeError("ObjectConnectionsView models must be live");
  if (
    modelSnapshot.call(props.connections) !==
    selectionSnapshot.call(props.selection)
  )
    throw new TypeError(
      "ObjectConnectionsView models must share a bound snapshot",
    );
}

export function ObjectConnectionsView(
  props: ObjectConnectionsViewProps,
): ReactElement {
  validate(props);
  const view = useConnectionsCommands(props);
  const { session, state, selected } = view;
  const { objects: selectedRefs } = useSelectionMembership(selected);
  const matchesSelection = useObjectSelectionMatch(selected);
  const { region, button, onBlurCapture } = useInspectorButtons(
    session,
    state,
    view.invoke,
    sameConnectionAction,
  );
  const id = useId();
  const target = state.target;
  const item = target === null ? null : queryTargetSelection(target);
  const data = state.status === "success" ? state.data : null;
  return (
    <section
      ref={region}
      id={`${id}-region`}
      role="region"
      tabIndex={-1}
      aria-label={props.ariaLabel}
      aria-busy={state.status === "pending"}
      className={`hier-object-connections-view${props.className ? ` ${props.className}` : ""}`}
      style={{ height: props.height }}
      onBlurCapture={onBlurCapture}
    >
      <header className="hier-object-connections-view__header">
        <h2>对象连接</h2>
        {state.status === "pending" && button("取消", { command: "cancel" })}
        {(state.status === "failed" || state.status === "cancelled") &&
          button("重试", { command: "reload" })}
        {data && item && (
          <>
            {button("刷新", { command: "reload" })}
            {button("选择查询目标", {
              command: "select",
              item,
              source: "target",
            })}
            {matchesSelection(item) && <span>已选中</span>}
          </>
        )}
      </header>
      <div role="status" aria-live="polite" tabIndex={-1}>
        {state.status === "idle" && "尚未指定连接目标"}
        {state.status === "pending" && "加载中"}
        {(state.status === "failed" || state.status === "cancelled") && (
          <>
            <div>{state.status === "failed" ? "加载失败" : "已取消"}</div>
            <div>
              {state.error.code}: {state.error.message}
            </div>
            {state.error.dataIssue && <div>诊断数据读取不完整</div>}
          </>
        )}
        {view.failed && <div>操作失败</div>}
      </div>
      {target && (
        <dl className="hier-object-connections-view__summary">
          <dt>查询对象</dt>
          <dd>{target.slice.ref}</dd>
          <dt>reach</dt>
          <dd>{target.reach}</dd>
          <dt>side</dt>
          <dd>{target.side ?? "未指定"}</dd>
          <dt>请求位段</dt>
          <dd>
            {target.slice.bits === undefined ? (
              "整个对象"
            ) : (
              <BitCoordinates bits={target.slice.bits} />
            )}
          </dd>
          {data && (
            <>
              <dt>名称</dt>
              <dd>{data.object.result.name}</dd>
              <dt>路径</dt>
              <dd>{data.object.result.pathText}</dd>
              <dt>种类</dt>
              <dd>{data.object.result.kind}</dd>
              <dt>实例引用</dt>
              <dd>{data.object.result.inst}</dd>
            </>
          )}
        </dl>
      )}
      {data && (
        <div className="hier-object-connections-view__groups">
          <ConnectionGroup
            id={`${id}-drivers`}
            label="驱动"
            reply={data.drivers}
            selectedRefs={selectedRefs}
            button={button}
          />
          <ConnectionGroup
            id={`${id}-loads`}
            label="负载"
            reply={data.loads}
            selectedRefs={selectedRefs}
            button={button}
          />
        </div>
      )}
    </section>
  );
}
