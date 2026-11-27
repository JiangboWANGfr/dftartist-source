import assert from "node:assert/strict";
export function heapGraph(heap) {
  const { nodes, edges, strings } = heap,
    m = heap.snapshot.meta,
    nf = m.node_fields,
    ef = m.edge_fields;
  for (const f of ["type", "name", "id", "edge_count"])
    assert(nf.includes(f), "required node field " + f);
  for (const f of ["type", "name_or_index", "to_node"])
    assert(ef.includes(f), "required edge field " + f);
  assert.equal(nodes.length % nf.length, 0);
  assert.equal(edges.length % ef.length, 0);
  const byID = new Map(),
    byOffset = new Map();
  let cursor = 0;
  for (let at = 0; at < nodes.length; at += nf.length) {
    const row = {
      id: String(nodes[at + nf.indexOf("id")]),
      type: m.node_types[0][nodes[at + nf.indexOf("type")]],
      name: strings[nodes[at + nf.indexOf("name")]],
      edges: [],
    };
    assert(!byID.has(row.id), "unique heap node id");
    byID.set(row.id, row);
    byOffset.set(at, row);
    const count = nodes[at + nf.indexOf("edge_count")];
    for (let j = 0; j < count; j++) {
      const edge = cursor + j * ef.length,
        type = m.edge_types[0][edges[edge + ef.indexOf("type")]],
        raw = edges[edge + ef.indexOf("name_or_index")];
      row.edges.push({
        type,
        name: type === "element" || type === "hidden" ? raw : strings[raw],
        offset: edges[edge + ef.indexOf("to_node")],
      });
    }
    cursor += count * ef.length;
  }
  assert.equal(cursor, edges.length, "all edges accounted");
  for (const row of byID.values())
    for (const edge of row.edges) {
      assert(byOffset.has(edge.offset), "actual edge target");
      edge.to = byOffset.get(edge.offset);
    }
  return { byID };
}
export function reactions(graph, id, state) {
  assert(
    ["pending", "fulfilled", "rejected"].includes(state),
    "known inspector state",
  );
  const root = graph.byID.get(String(id));
  assert(root, "original promise heap id exists");
  assert.equal(root.name, "Promise");
  assert.equal(root.type, "object");
  if (state !== "pending")
    return {
      status: "unsupported-settled",
      state,
      original: id,
      reactions: [],
    };
  const start = root.edges.filter(
    (e) => e.type === "internal" && e.name === "reactions_or_result",
  );
  assert.equal(start.length, 1, "pending known internal reaction root");
  let node = start[0].to;
  const rows = [],
    seen = new Set();
  while (node) {
    assert.equal(
      node.name,
      "system / PromiseReaction",
      "supported reaction node",
    );
    assert.equal(node.type, "native");
    assert(!seen.has(node.id), "no reaction cycle");
    seen.add(node.id);
    const hidden = node.edges.filter((e) => e.type === "hidden"),
      next = hidden.filter((e) => e.to.name === "system / PromiseReaction");
    assert(next.length <= 1, "one next link");
    assert(
      node.edges.every(
        (e) =>
          e.type === "hidden" || (e.type === "internal" && e.name === "map"),
      ),
      "known reaction edge kinds",
    );
    assert(
      hidden.every(
        (e) =>
          e.to.name === "system / PromiseReaction" ||
          e.to.type === "closure" ||
          (e.to.type === "object" && e.to.name === "Promise"),
      ),
      "unknown hidden layout is unsupported, not an empty handler",
    );
    assert.equal(
      hidden.filter((e) => e.to.type === "object" && e.to.name === "Promise")
        .length,
      1,
      "known promise capability shape",
    );
    const closures = hidden
      .filter((e) => e.to.type === "closure")
      .map((e) => ({ id: e.to.id, type: e.to.type, name: e.to.name }));
    assert(closures.length <= 2, "known control at most two closures");
    rows.push({ id: node.id, closures });
    node = next[0]?.to;
  }
  return {
    status: "pending-structure-only",
    state,
    original: id,
    reactions: rows,
  };
}
export function delta(before, after) {
  assert.equal(before.status, "pending-structure-only");
  assert.equal(after.status, before.status);
  assert.equal(after.original, before.original);
  const old = new Map(before.reactions.map((r) => [r.id, r]));
  for (const [id, row] of old)
    assert.deepEqual(
      after.reactions.find((r) => r.id === id),
      row,
      "baseline reaction/closures retained",
    );
  const rows = after.reactions.filter((r) => !old.has(r.id));
  return {
    newReactions: rows.length,
    dual: rows.filter((r) => r.closures.length === 2).length,
    single: rows.filter((r) => r.closures.length === 1).length,
    empty: rows.filter((r) => r.closures.length === 0).length,
    rows,
  };
}
