import { Fragment, type ReactElement } from "react";
import type {
  GraphSessionState,
  ProjectedGraphNode,
  ProjectedGraphEdge,
  FoldedGraphNode,
  FoldedGraphEdge,
  GraphNodeMember,
  GraphEdgeMember,
} from "@hier/viewmodel";

export type SchematicDescriptor =
  ProjectedGraphNode | ProjectedGraphEdge | FoldedGraphNode | FoldedGraphEdge;

// These are presentation field lists, not a copy or a serialization of the DTO.
// In particular, unknown extensions and arbitrary toJSON methods are never expanded.
type Field = string | readonly [string, readonly Field[]];
const bits = ["lsb", "width"] as const;
const selection = ["ref", ["bits", bits], "side"] as const;
const point = [["slice", ["ref", ["bits", bits]]], "side"] as const;
const endpoint = [["node", ["kind", "id", "key"]], "port"] as const;
const nodeFields = ["id", "kind", ["point", point], "ref", "fact", "value", "reason"] as const;
const edgeFields = [
  "id",
  "fact",
  "from",
  "to",
  "via",
  "kind",
  "role",
  "precision",
  "align",
  ["fromBits", bits],
  ["toBits", bits],
  ["map", ["from", "to", "width"]],
] as const;
const frontierFields = [["point", point], "reason", "depth", "stepCursor"] as const;

function Fields({ value, fields }: { value: unknown; fields: readonly Field[] }): ReactElement {
  if (Array.isArray(value))
    return (
      <ol>
        {value.map((item, index) => (
          <li key={index}>
            <Fields value={item} fields={fields} />
          </li>
        ))}
      </ol>
    );
  if (!value || typeof value !== "object") return <></>;
  const record = value as Record<string, unknown>;
  return (
    <dl>
      {fields.map((field) => {
        const name = typeof field === "string" ? field : field[0],
          item = record[name];
        if (item === undefined) return null;
        const display =
          typeof field !== "string" ? (
            <Fields value={item} fields={field[1]} />
          ) : typeof item === "string" || typeof item === "number" ? (
            item
          ) : typeof item === "boolean" ? (
            String(item)
          ) : null;
        return (
          <Fragment key={name}>
            <dt>{name}</dt>
            <dd>{display}</dd>
          </Fragment>
        );
      })}
    </dl>
  );
}

export function SchematicSources({ state }: { state: GraphSessionState }): ReactElement {
  return (
    <section className="hier-schematic-view__sources" aria-label="图来源">
      <h3>图来源</h3>
      {state.sources.map((source) => (
        <article key={source.id}>
          <h4>{source.label}</h4>
          <div>
            {source.origin} · {source.status}
          </div>
          {source.error && (
            <div>
              {source.error.code} · {source.error.origin}: {source.error.message}
            </div>
          )}
          {source.content ? (
            <>
              {(source.status === "failed" || source.status === "cancelled") && <div>先前结果</div>}
              <Fields
                value={source.content.completeness}
                fields={["status", ["reasons", ["code", "at", "detail"]]]}
              />
              <div>
                frontier: {source.content.frontier.length} · hasConservative:{" "}
                {String(source.content.hasConservative)}
              </div>
              <Fields value={source.content.frontier} fields={frontierFields} />
            </>
          ) : (
            <div>尚无结果</div>
          )}
        </article>
      ))}
    </section>
  );
}

export function SchematicDetails({
  descriptor,
  state,
}: {
  descriptor: SchematicDescriptor | undefined;
  state: GraphSessionState;
}): ReactElement {
  if (!descriptor)
    return (
      <section className="hier-schematic-view__details" aria-label="图元详情">
        <h3>图元详情</h3>
        <p>聚焦图元查看原始事实</p>
      </section>
    );
  return (
    <section className="hier-schematic-view__details" aria-label="图元详情">
      <h3>图元详情</h3>
      <div>
        {descriptor.target.kind} · {descriptor.target.id}
      </div>
      <div>{descriptor.label}</div>
      {"member" in descriptor ? (
        <MemberDetails member={descriptor.member} state={state} />
      ) : (
        <>
          {descriptor.groupKey !== undefined && <div>groupKey: {descriptor.groupKey}</div>}
          <h4>members: {descriptor.members.length}</h4>
          {descriptor.members.map((member) => (
            <MemberDetails key={member.id} member={member} state={state} />
          ))}
          {"internalEdges" in descriptor && (
            <>
              <h4>internalEdges: {descriptor.internalEdges.length}</h4>
              {descriptor.internalEdges.map((member) => (
                <MemberDetails key={member.id} member={member} state={state} />
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}

/** One original-member renderer for flat, aggregated and hidden internal members. */
function MemberDetails({
  member,
  state,
}: {
  member: GraphNodeMember | GraphEdgeMember;
  state: GraphSessionState;
}): ReactElement {
  return (
    <article className="hier-schematic-view__member">
      <div>{member.id}</div>
      <h4>owners</h4>
      <ul>
        {member.owners.map((id) => {
          const source = state.sources.find((s) => s.id === id);
          return (
            <li key={id}>
              {id} · {source?.label} · {source?.origin}
            </li>
          );
        })}
      </ul>
      {"node" in member ? (
        member.node.kind === "design" ? (
          <Fields value={member.node.value} fields={nodeFields} />
        ) : (
          <Fields
            value={member.node}
            fields={["kind", "key", "label", ["target", selection], ["ports", ["key", "label"]]]}
          />
        )
      ) : member.edge.kind === "design" ? (
        <Fields value={member.edge.value} fields={edgeFields} />
      ) : (
        <Fields
          value={member.edge}
          fields={["kind", "key", "label", ["from", endpoint], ["to", endpoint]]}
        />
      )}
    </article>
  );
}
