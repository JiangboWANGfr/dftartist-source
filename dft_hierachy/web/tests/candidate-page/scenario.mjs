export const snapshotId = "A-candidate-page-membership";
export function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const hash = "0123456789abcdef".repeat(4);
export const span = freeze({
  file: "A-file/尾", path: "/not-a-file-capability/A.sv", contentHash: hash,
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 },
});
export function hit(n, refKind = "object") {
  return freeze({
    ref: `A/opaque\u0000/尾/${n}`, kind: "definition", span,
    ...(refKind === undefined ? {} : { refKind }),
  });
}
export function page(n, next, { count = 2, partial = false } = {}) {
  return freeze({
    result: { items: Array.from({ length: count }, (_, i) => hit(n * count + i, i % 2 ? "definition" : "object")), ...(next === undefined ? {} : { next }) },
    completeness: { status: partial ? "partial" : "complete", reasons: partial ? [{ code: "indexing" }] : [] },
  });
}
export async function createContext(vm, options = { pageSize: 2 }) {
  const calls = [], ready = new Set();
  const client = {
    snapshot: freeze({ snapshotId }),
    source: async (ref, kind) => {
      calls.push({ method: "source", ref, kind });
      return freeze({ result: span, completeness: { status: "complete", reasons: [] } });
    },
    readSource: async (file) => {
      calls.push({ method: "readSource", file });
      return freeze({ result: { text: "ab中😀\r\nZ", contentHash: hash, matchesSnapshot: true }, completeness: { status: "complete", reasons: [] } });
    },
    resolveSource: (query, request, signal) => {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      calls.push({ method: "resolveSource", query, request, signal, resolve, reject });
      return promise;
    },
    onIndexReady: (listener) => { ready.add(listener); return () => ready.delete(listener); },
  };
  const model = new vm.SourceNavigationModel(client, options);
  const selection = new vm.SelectionModel({ snapshotId });
  await model.load("A-document", "definition");
  const document = model.state.document.data;
  const answer = async (command, reply) => {
    const operation = command();
    calls.at(-1).resolve(reply);
    await operation;
    return model.state.candidates.state.pages;
  };
  return {
    model, selection, document, calls, ready, answer,
    close() { model.dispose(); selection.dispose(); return { readyListeners: ready.size }; },
  };
}
