// Reading our own generated .spec back into the nested object the config dialogs edit.
//
// The Scan Planner emits a whole `Controller(NAME) { … }` block — Compactor, ShiftPowerOptions,
// Connections, the channel pipelines — and the EDT dialog used to receive four scalars out of it.
// The two screens then disagreed about everything else, which reads as "the data did not come
// through". Parsing the block is what makes them the same config: whatever the Budget page shows
// is exactly what the dialog gets, including fields added later that nobody wired up by hand.
//
// The grammar is only what we emit: `name : value;`, `Name { … }`, `Name(id) { … }`, `//` comments.

export type SpecNode = { [k: string]: string | SpecNode | SpecNode[] };

/** Pull one `Controller(NAME) { … }` block out of a generated spec, brace-matched. Per-controller
 *  is how a config is read and reviewed; one undifferentiated file is not. */
export function controllerBlock(spec: string, name: string): string {
  const at = spec.indexOf(`Controller(${name})`);
  if (at < 0) return "";
  let depth = 0;
  for (let i = at; i < spec.length; i++) {
    if (spec[i] === "{") depth++;
    else if (spec[i] === "}") {
      depth--;
      if (depth === 0) {
        // keep the indentation of the opening line so the block reads as it sits in the file
        const bol = spec.lastIndexOf("\n", at) + 1;
        return spec.slice(bol, i + 1);
      }
    }
  }
  return spec.slice(at);
}

const OPEN = /^([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?\s*\{$/;
const PROP = /^([A-Za-z_]\w*)\s*:\s*(.*?)\s*;?$/;

/** Parse the BODY of one block (the outer `Name … {` header line is consumed and dropped). */
export function parseSpecBlock(text: string): SpecNode {
  const lines = text.split(/\r?\n/);
  let i = 0;
  const body = (): SpecNode => {
    const out: SpecNode = {};
    while (i < lines.length) {
      const line = lines[i++].replace(/\/\/.*$/, "").trim();
      if (!line) continue;
      if (line.startsWith("}")) return out;
      const open = OPEN.exec(line);
      if (open) {
        const [, name, id] = open;
        const inner = body();
        // An id'd block is a list even when only one appeared — EdtChannelsIn(4:1) and a second
        // range are the same construct, and a scalar here would drop the second one on save.
        if (id !== undefined) {
          if (id) inner.id = id;
          const prev = out[name];
          out[name] = Array.isArray(prev) ? [...prev, inner] : [inner];
        } else out[name] = inner;
        continue;
      }
      const prop = PROP.exec(line);
      if (prop) out[prop[1]] = prop[2];
    }
    return out;
  };
  while (i < lines.length && !/\{\s*$/.test(lines[i])) i++;
  i++;  // the header line itself
  return body();
}

/** The generated config for one controller, as the object the dialog edits. */
export function controllerConfig(spec: string, name: string): SpecNode {
  const block = controllerBlock(spec, name);
  return block ? parseSpecBlock(block) : {};
}

/** Deep-merge `add` into `base`.
 *
 *  overwrite=false is the on-open fill: a field someone typed is theirs and stays, an empty or
 *  absent one takes the planner's value. overwrite=true is the explicit Re-apply button.
 *  Returns `base` itself when nothing changed, so it is safe to call from a React effect. */
export function mergeSpec(base: SpecNode, add: SpecNode, overwrite = false): SpecNode {
  let out = base;
  const set = (k: string, v: string | SpecNode | SpecNode[]) => {
    if (out === base) out = { ...base };
    out[k] = v;
  };
  for (const [k, v] of Object.entries(add)) {
    const cur = base[k];
    if (typeof v === "string") {
      if (overwrite ? cur !== v : cur === undefined || cur === "") set(k, v);
    } else if (Array.isArray(v)) {
      const curArr = Array.isArray(cur) ? cur : [];
      if (overwrite || !curArr.length) { if (!sameArr(curArr, v)) set(k, v); }
      else {
        // Same slot, element by element: keep what is there, fill the gaps.
        const merged = v.map((item, i) => mergeSpec((curArr[i] ?? {}) as SpecNode, item, overwrite));
        if (merged.some((m, i) => m !== curArr[i]) || merged.length !== curArr.length)
          set(k, curArr.length > merged.length ? [...merged, ...curArr.slice(merged.length)] : merged);
      }
    } else {
      const curObj = (cur && typeof cur === "object" && !Array.isArray(cur) ? cur : {}) as SpecNode;
      const merged = mergeSpec(curObj, v, overwrite);
      // An empty sub-block is nothing to carry over: writing `{}` in would make every pass look
      // like a change and dirty a draft nobody edited.
      if (merged !== curObj || (cur === undefined && Object.keys(merged).length)) set(k, merged);
    }
  }
  return out;
}

function sameArr(a: SpecNode[], b: SpecNode[]): boolean {
  return a.length === b.length && a.every((x, i) => JSON.stringify(x) === JSON.stringify(b[i]));
}
