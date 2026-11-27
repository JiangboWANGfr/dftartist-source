import type { ReactElement } from "react";
import type { BitRange, ObjectRef } from "@hier/protocol-types";
import type { ObjectConnections } from "@hier/viewmodel";
import type { ConnectionAction } from "./object-connections-commands.js";

type Endpoint = ObjectConnections["drivers"]["result"][number];
type Bits = Readonly<Pick<BitRange, "lsb" | "width">>;

export function BitCoordinates({
  bits,
}: {
  readonly bits: Bits | undefined;
}): ReactElement {
  return (
    <>
      {bits === undefined ? (
        "未提供"
      ) : (
        <>
          lsb: {bits.lsb}, width: {bits.width}
        </>
      )}
    </>
  );
}

function SliceCoordinates({
  slice,
}: {
  readonly slice: Readonly<{ ref: ObjectRef; bits: Bits }> | undefined;
}): ReactElement {
  return slice === undefined ? (
    <>未提供</>
  ) : (
    <>
      {slice.ref} · <BitCoordinates bits={slice.bits} />
    </>
  );
}

function BoundarySteps({
  via,
}: {
  readonly via: Endpoint["via"];
}): ReactElement {
  return via.length === 0 ? (
    <>无边界步骤</>
  ) : (
    <ol>
      {via.map((step, index) => (
        <li key={index}>
          <div>
            from: <SliceCoordinates slice={step.from} />
          </div>
          <div>via: {step.via}</div>
          <div>map:</div>
          <ol>
            {step.map.map((segment, i) => (
              <li key={i}>
                from: {segment.from}, to: {segment.to}, width: {segment.width}
              </li>
            ))}
          </ol>
          <div>next:</div>
          <ol>
            {step.next.map((next, i) => (
              <li key={i}>
                <SliceCoordinates slice={next.slice} /> · role: {next.role} ·
                precision: {next.precision}
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

function SourceLocation({
  source,
}: {
  readonly source: Endpoint["source"];
}): ReactElement {
  return source === undefined ? (
    <>未提供</>
  ) : (
    <>
      <div>file: {source.file}</div>
      <div>path: {source.path}</div>
      <div>
        start: offset: {source.start.offset}, line: {source.start.line}, column:{" "}
        {source.start.column}
      </div>
      <div>
        end: offset: {source.end.offset}, line: {source.end.line}, column:{" "}
        {source.end.column}
      </div>
      <div>contentHash: {source.contentHash}</div>
    </>
  );
}

/** Render only declared endpoint fields; keep all coordinate systems separate. */
export function ConnectionGroup({
  id,
  label,
  reply,
  selectedRefs,
  button,
}: {
  readonly id: string;
  readonly label: "驱动" | "负载";
  readonly reply: ObjectConnections["drivers"];
  readonly selectedRefs: ReadonlySet<ObjectRef>;
  readonly button: (label: string, action: ConnectionAction) => ReactElement;
}): ReactElement {
  const { status, reasons } = reply.completeness;
  return (
    <section aria-labelledby={id}>
      <h3 id={id}>{label}</h3>
      <div>
        {status} · {status === "partial" ? "结果不完整" : "结果完整"}
      </div>
      {reasons.length > 0 && (
        <ul aria-label="结果完整性的原因">
          {reasons.map((reason, i) => (
            <li key={i}>
              {reason.code}
              {reason.at !== undefined && <span> · at: {reason.at}</span>}
              {reason.detail !== undefined && (
                <span> · detail: {reason.detail}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="hier-object-connections-view__scroll" tabIndex={-1}>
        {reply.result.length === 0 ? (
          <p>
            {status === "partial"
              ? "尚无已返回端点（结果不完整）"
              : `无${label}`}
          </p>
        ) : (
          <table aria-labelledby={id}>
            <thead>
              <tr>
                {[
                  "选择",
                  "种类",
                  "对象引用",
                  "实例引用",
                  "查询对象位段",
                  "端点位段",
                  "作用位置",
                  "值",
                  "原因",
                  "边界步骤",
                  "源码位置",
                ].map((name) => (
                  <th scope="col" key={name}>
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reply.result.map((endpoint, index) => (
                <tr key={index}>
                  <td>
                    {endpoint.ref !== undefined && (
                      <>
                        {button("选择整个端点对象", {
                          command: "select",
                          item: Object.freeze({ ref: endpoint.ref }),
                          source: `${id}:${index}`,
                        })}
                        {selectedRefs.has(endpoint.ref) && <span>对象在选择中</span>}
                      </>
                    )}
                  </td>
                  <td>{endpoint.kind}</td>
                  <td>{endpoint.ref ?? "未提供"}</td>
                  <td>{endpoint.inst ?? "未提供"}</td>
                  <td>
                    <BitCoordinates bits={endpoint.queried} />
                  </td>
                  <td>
                    <BitCoordinates bits={endpoint.bits} />
                  </td>
                  <td>
                    <SliceCoordinates slice={endpoint.at} />
                  </td>
                  <td>{endpoint.value ?? "未提供"}</td>
                  <td>{endpoint.reason ?? "未提供"}</td>
                  <td>
                    <BoundarySteps via={endpoint.via} />
                  </td>
                  <td>
                    <SourceLocation source={endpoint.source} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
