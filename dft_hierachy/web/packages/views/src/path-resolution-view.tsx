import { useSelectionMembership } from "./selection-membership.js";
import { useId, useLayoutEffect, useMemo, type ReactElement } from "react";
import { PathResolutionModel, SelectionModel } from "@hier/viewmodel";
import type { PathResolutionReply } from "@hier/viewmodel";
import {
  usePathResolutionCommands,
  samePathResolutionAction,
} from "./path-resolution-commands.js";
import { useInspectorButtons } from "./inspector-buttons.js";
import type { PathResolutionViewProps } from "./path-resolution-view-types.js";

const modelDisposed = Object.getOwnPropertyDescriptor(
  PathResolutionModel.prototype,
  "disposed",
)!.get!;
const modelSnapshot = Object.getOwnPropertyDescriptor(
  PathResolutionModel.prototype,
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

function validate(props: PathResolutionViewProps): void {
  if (typeof props.ariaLabel !== "string" || !props.ariaLabel.trim())
    throw new TypeError(
      "PathResolutionView ariaLabel must be a nonblank string",
    );
  if (
    typeof props.height !== "number" ||
    !Number.isFinite(props.height) ||
    props.height <= 0
  )
    throw new TypeError(
      "PathResolutionView height must be finite and positive",
    );
  if (props.className !== undefined && typeof props.className !== "string")
    throw new TypeError("PathResolutionView className must be a string");
  if (
    props.onCommandError !== undefined &&
    typeof props.onCommandError !== "function"
  )
    throw new TypeError("PathResolutionView onCommandError must be a function");
  if (
    modelDisposed.call(props.resolution) ||
    selectionDisposed.call(props.selection)
  )
    throw new TypeError("PathResolutionView models must be live");
  if (
    modelSnapshot.call(props.resolution) !==
    selectionSnapshot.call(props.selection)
  )
    throw new TypeError(
      "PathResolutionView models must share a bound snapshot",
    );
}

/** Borrowed path results; only an explicit row action changes Selection. */
export function PathResolutionView(
  props: PathResolutionViewProps,
): ReactElement {
  validate(props);
  const { session, state, selected, invoke, failed } =
    usePathResolutionCommands(props);
  const { objects: selectedRefs } = useSelectionMembership(selected);
  const { region, button, onBlurCapture } = useInspectorButtons(
    session,
    state,
    invoke,
    samePathResolutionAction,
  );
  const id = useId();
  const replyKey = useMemo(() => {
    const keys = new WeakMap<PathResolutionReply, number>();
    let next = 0;
    return (reply: PathResolutionReply): number => {
      let key = keys.get(reply);
      if (key === undefined) keys.set(reply, (key = next++));
      return key;
    };
  }, []);
  useLayoutEffect(() => {
    region.current?.scrollTo({ top: 0, left: 0 });
  }, [session, region]);
  const { query } = state;
  const reply = state.status === "success" ? state.reply : undefined;
  const partial = reply?.completeness.status === "partial";
  return (
    <section
      ref={region}
      id={`${id}-region`}
      role="region"
      tabIndex={-1}
      aria-label={props.ariaLabel}
      aria-busy={state.status === "pending"}
      className={`hier-path-resolution-view${props.className ? ` ${props.className}` : ""}`}
      style={{ height: props.height }}
      onBlurCapture={onBlurCapture}
    >
      <header className="hier-path-resolution-view__header">
        <h2>路径定位</h2>
        {state.status === "pending" &&
          button("取消定位", { command: "cancel" })}
        {query !== null &&
          state.status !== "pending" &&
          button("重新定位", { command: "reload" })}
      </header>
      <div role="status" aria-live="polite">
        {state.status === "idle" && "尚未定位路径"}
        {state.status === "pending" && "正在定位路径"}
        {(state.status === "failed" || state.status === "cancelled") && (
          <>
            <div>
              {state.status === "failed" ? "路径定位失败" : "路径定位已取消"}
            </div>
            <div>
              {state.error.origin}: {state.error.code}: {state.error.message}
            </div>
            {state.error.dataIssue && <div>诊断数据读取不完整</div>}
          </>
        )}
        {reply && <div>已返回{reply.result.length}项</div>}
        {partial && <div>结果不完整</div>}
        {reply?.result.length === 0 && (
          <div>
            {partial ? "当前结果未返回对象（结果不完整）" : "未找到匹配路径"}
          </div>
        )}
        {failed && <div>操作失败</div>}
      </div>
      {query !== null && (
        <dl className="hier-path-resolution-view__query">
          <dt>查询路径</dt>
          <dd>
            {query.text}
            {query.text === "" && <span>空文本</span>}
          </dd>
        </dl>
      )}
      {reply && (
        <div
          key={replyKey(reply)}
          className="hier-path-resolution-view__results"
        >
          <div>完整性：{reply.completeness.status}</div>
          <ul>
            {reply.completeness.reasons.map((reason, index) => (
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
                <th scope="col">引用</th>
                <th scope="col">选择</th>
              </tr>
            </thead>
            <tbody>
              {reply.result.map((ref, itemIndex) => (
                <tr key={itemIndex}>
                  <td>{ref}</td>
                  <td>
                    {button("选择对象", {
                      command: "select",
                      reply,
                      itemIndex,
                    })}
                    {selectedRefs.has(ref) && (
                      <span>对象在选择中</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
