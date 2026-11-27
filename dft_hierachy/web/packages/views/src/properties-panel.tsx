import { useSelectionMembership } from "./selection-membership.js";
import { useId, type ReactElement } from "react";
import { useInspectorButtons } from "./inspector-buttons.js";
import { InstancePropertiesModel, SelectionModel } from "@hier/viewmodel";
import {
  usePropertiesCommands,
  type PanelAction,
} from "./properties-panel-commands.js";
import type { PropertiesPanelProps } from "./properties-panel-types.js";

// Private-field getters reject forged instances/proxies before subscription.
const propertiesDisposed = Object.getOwnPropertyDescriptor(
  InstancePropertiesModel.prototype,
  "disposed",
)!.get!;
const propertiesSnapshot = Object.getOwnPropertyDescriptor(
  InstancePropertiesModel.prototype,
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

function validate(props: PropertiesPanelProps): void {
  if (typeof props.ariaLabel !== "string" || !props.ariaLabel.trim())
    throw new TypeError("PropertiesPanel ariaLabel must be a nonblank string");
  if (
    typeof props.height !== "number" ||
    !Number.isFinite(props.height) ||
    props.height <= 0
  )
    throw new TypeError("PropertiesPanel height must be finite and positive");
  if (props.className !== undefined && typeof props.className !== "string")
    throw new TypeError("PropertiesPanel className must be a string");
  if (
    props.onCommandError !== undefined &&
    typeof props.onCommandError !== "function"
  )
    throw new TypeError("PropertiesPanel onCommandError must be a function");
  if (
    propertiesDisposed.call(props.properties) ||
    selectionDisposed.call(props.selection)
  )
    throw new TypeError("PropertiesPanel models must be live");
  if (
    propertiesSnapshot.call(props.properties) !==
    selectionSnapshot.call(props.selection)
  )
    throw new TypeError("PropertiesPanel models must share a bound snapshot");
}

const optional = (
  value: string | number | boolean | undefined,
): string | number =>
  value === undefined
    ? "未提供"
    : typeof value === "boolean"
      ? String(value)
      : value;

export function PropertiesPanel(props: PropertiesPanelProps): ReactElement {
  validate(props);
  const view = usePropertiesCommands(props);
  const { session, state, selected } = view;
  const { objects: selectedRefs } = useSelectionMembership(selected);
  const id = useId();
  const { region, button, onBlurCapture } = useInspectorButtons(
    session,
    state,
    view.invoke,
    (left: PanelAction, right: PanelAction) =>
      left.command === right.command &&
      (left.command !== "select" ||
        (right.command === "select" && left.ref === right.ref)),
  );
  const data = state.status === "success" ? state.data : null;
  const inst = data?.instance.result;
  return (
    <section
      ref={region}
      id={`${id}-region`}
      role="region"
      tabIndex={-1}
      aria-label={props.ariaLabel}
      aria-busy={state.status === "pending"}
      className={`hier-properties-panel${props.className ? ` ${props.className}` : ""}`}
      style={{ height: props.height }}
      onBlurCapture={onBlurCapture}
    >
      <header className="hier-properties-panel__header">
        <h2>实例属性</h2>
        {state.status === "pending" && button("取消", { command: "cancel" })}
        {(state.status === "failed" || state.status === "cancelled") &&
          button("重试", { command: "reload" })}
        {inst && (
          <>
            {button("刷新", { command: "reload" })}
            {button("选择实例", { command: "select", ref: inst.ref })}
            {selectedRefs.has(inst.ref) && <span>已选中</span>}
          </>
        )}
      </header>
      <div
        role="status"
        tabIndex={-1}
        aria-live="polite"
        className="hier-properties-panel__status"
      >
        {state.status === "idle" && "尚未指定实例"}
        {state.status === "pending" && <>加载中 · {state.target}</>}
        {(state.status === "failed" || state.status === "cancelled") && (
          <>
            <div>
              {state.status === "failed" ? "加载失败" : "已取消"} ·{" "}
              {state.target}
            </div>
            <div>
              {state.error.code}: {state.error.message}
            </div>
            {state.error.dataIssue && <div>诊断数据读取不完整</div>}
          </>
        )}
        {view.failed && <div>操作失败</div>}
      </div>
      {data && inst && (
        <div className="hier-properties-panel__groups">
          <section aria-labelledby={`${id}-summary`}>
            <h3 id={`${id}-summary`}>实例概要</h3>
            <div className="hier-properties-panel__scroll" tabIndex={-1}>
              <dl>
                <dt>名称</dt>
                <dd>{inst.name}</dd>
                <dt>路径</dt>
                <dd>{inst.pathText}</dd>
                <dt>种类</dt>
                <dd>{inst.kind}</dd>
                <dt>定义</dt>
                <dd>{inst.defName}</dd>
                <dt>子实例数</dt>
                <dd>{inst.childCount}</dd>
                <dt>参数覆盖</dt>
                <dd>{String(inst.hasParamOverrides)}</dd>
                <dt>实例引用</dt>
                <dd>{inst.ref}</dd>
                <dt>定义引用</dt>
                <dd>{inst.def}</dd>
              </dl>
            </div>
          </section>
          <section aria-labelledby={`${id}-ports`}>
            <h3 id={`${id}-ports`}>端口</h3>
            <div className="hier-properties-panel__scroll" tabIndex={-1}>
              {data.ports.result.length === 0 ? (
                <p>无端口</p>
              ) : (
                <table aria-labelledby={`${id}-ports`}>
                  <thead>
                    <tr>
                      {[
                        "选择",
                        "名称",
                        "方向",
                        "种类",
                        "类型",
                        "位宽",
                        "有符号",
                        "维度",
                        "接口定义",
                        "Modport",
                      ].map((label) => (
                        <th scope="col" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.ports.result.map((port) => (
                      <tr key={port.ref}>
                        <td>
                          {button("选择端口", {
                            command: "select",
                            ref: port.ref,
                          })}
                          {selectedRefs.has(port.ref) && <span>已选中</span>}
                        </td>
                        <td>{port.name}</td>
                        <td>{port.direction}</td>
                        <td>{port.kind}</td>
                        <td>{optional(port.type)}</td>
                        <td>{port.width ?? "未知"}</td>
                        <td>{optional(port.signed)}</td>
                        <td>
                          {port.dims === undefined
                            ? "未提供"
                            : port.dims.length === 0
                              ? "无维度"
                              : port.dims.map((dim, index) => (
                                  <div key={index}>
                                    [{dim.left}:{dim.right}]{" "}
                                    {dim.packed ? "packed" : "unpacked"}
                                  </div>
                                ))}
                        </td>
                        <td>{optional(port.interfaceDef)}</td>
                        <td>{optional(port.modport)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
          <section aria-labelledby={`${id}-params`}>
            <h3 id={`${id}-params`}>参数</h3>
            <div className="hier-properties-panel__scroll" tabIndex={-1}>
              {data.params.result.length === 0 ? (
                <p>无参数</p>
              ) : (
                <table aria-labelledby={`${id}-params`}>
                  <thead>
                    <tr>
                      {[
                        "名称",
                        "值",
                        "类型",
                        "类型参数",
                        "局部参数",
                        "端口参数",
                        "已覆盖",
                      ].map((label) => (
                        <th scope="col" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.params.result.map((param, index) => (
                      <tr key={index}>
                        <td>{param.name}</td>
                        <td>{param.value}</td>
                        <td>{optional(param.type)}</td>
                        <td>{String(param.isType)}</td>
                        <td>{String(param.isLocal)}</td>
                        <td>{String(param.isPort)}</td>
                        <td>{String(param.isOverridden)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
