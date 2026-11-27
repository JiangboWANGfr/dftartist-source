// F6 — 右·检查器：选中实例时编辑实例名 + 它引用 def 的属性（改 def 影响所有实例）。

import { useMemo, useState } from "react";
import { useStore } from "./store.ts";
import { useDesign } from "../store/design.ts";
import type { BusInterface, BusType, DesignLevel, DesignType, HardenDef, HardenInstance, Role } from "./core/model.ts";
import { expandInterface } from "./core/expand.ts";
import { canAddInterface } from "./core/edit.ts";
import { BUS_COLOR, DEF_PALETTE } from "./layout.ts";
import { ifaceSuggestions } from "./suggest.ts";
import { promptText } from "./promptDialog.tsx";
import { InspectorShell, InspectorBody, InspectorSection, InspectorField } from "../common/inspector/Inspector.tsx";
import { DS_LABEL, usedPdNames } from "./dataSource.ts";
import { notify } from "../common/notify.ts";

/** if 名 / pd 的下拉建议 datalist（选项 = 当前文档已用值）。供新增表单 + 编辑栏共用。 */
function IfaceDatalists() {
  const lib = useStore((s) => s.doc.library);
  const sg = useMemo(() => ifaceSuggestions(lib), [lib]);
  return (
    <>
      <datalist id="sg-if">{sg.ifNames.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="sg-pd">{sg.pds.map((n) => <option key={n} value={n} />)}</datalist>
    </>
  );
}

const LEVELS: DesignLevel[] = ["chip", "physical_block", "sub_block"];
const TYPES: DesignType[] = ["tiling", "hierarchical"];
const BUSES: BusType[] = ["SSN", "IJTAG", "BISR", "BSCAN", "JTAG1838"];

type SideV = "top" | "bottom" | "left" | "right";
const SIDE_LABEL: Record<SideV, string> = { top: "Top", bottom: "Bottom", left: "Left", right: "Right" };
const resolveSide = (i: BusInterface): SideV => i.edge?.side ?? (i.role === "client" ? "left" : "right");

function ifaceSummary(i: BusInterface): string {
  const p: string[] = [];
  if (i.powerDomain) p.push(i.powerDomain);
  if (i.interfaceName) p.push(i.interfaceName);
  if (i.busType === "BSCAN" && i.bscanVariant) p.push(i.bscanVariant);
  if (i.busType === "SSN") p.push(`[${(i.busWidth ?? 4) - 1}:0]`);
  return p.join(" ");
}

const SIDES: { v: SideV; t: string }[] = [
  { v: "top", t: "Top" },
  { v: "bottom", t: "Bottom" },
  { v: "left", t: "Left" },
  { v: "right", t: "Right" },
];

/** 实例检查器里的接口清单：点某条 = 选中它（画布高亮 + 右栏切到该接口编辑）。下面是“＋接口”。 */
function InterfaceEditor({ def, onError, onPick }: { def: HardenDef; onError: (fn: () => void) => void; onPick: (ifId: string) => void }) {
  const addInterface = useStore((s) => s.addInterface);
  const [busType, setBusType] = useState<BusType>("SSN");
  const [role, setRole] = useState<Role>("client");
  const [name, setName] = useState("");
  const [pd, setPd] = useState("");
  const [pdMatchOnly, setPdMatchOnly] = useState(false);
  const [width, setWidth] = useState("4"); // 字符串：允许清空再输入（避免一删就变 1）
  const [variant, setVariant] = useState<"DC" | "AC">("DC");
  const [isDS, setIsDS] = useState(false);

  const spec: Omit<BusInterface, "id"> = { busType, role };
  if (role === "secondary") spec.interfaceName = name || "if";
  if (busType === "BISR") {
    spec.powerDomain = pd || undefined; // pd 可选：留空 → 信号名不带 <pd>_
    if (pdMatchOnly) spec.pdMatchOnly = true; // pd 仅匹配：名字不带 pd 但仍精确匹配
  }
  if (busType === "SSN") spec.busWidth = Math.max(1, Math.floor(Number(width) || 1));
  if (busType === "BSCAN") spec.bscanVariant = variant;
  if (isDS) spec.isDataSource = true;
  // Lifted from addInterface's own check (core/edit.ts) — surfaced BEFORE the click instead of
  // only as a toast after it, so the button itself explains why it's disabled.
  const blockedReason = canAddInterface(def, spec);

  const add = () =>
    onError(() => {
      addInterface(def.id, spec);
      setName("");
    });

  return (
    <InspectorSection title={<>Interfaces ({def.interfaces.length})<small>Click to edit</small></>}>
      <ul className="iface-list">
        {def.interfaces.map((i) => (
          <li key={i.id} className="iface-row" onClick={() => onPick(i.id)} title="Click to view / edit this interface">
            <span className="iface-chip" style={{ background: BUS_COLOR[i.busType] }} />
            <span className="iface-bt">{i.busType}</span>
            {/* Spelled out, not "C"/"S" — those read as Client/Server, but "secondary" is a
                Tessent pairing concept (it connects INTO a client of the same protocol
                elsewhere), unrelated to a network server. The single-letter badge invited
                exactly that misreading. */}
            <span className={`iface-role ${i.role}`}
                  title={i.role === "secondary"
                    ? "Secondary — connects into a Client interface of the same protocol elsewhere. Not a network server."
                    : "Client — the side other instances' Secondary interfaces connect into."}>
              {i.role === "client" ? "Client" : "Secondary"}
            </span>
            <span className="iface-sum">{ifaceSummary(i)}</span>
            <span className="iface-side-tag">{SIDE_LABEL[resolveSide(i)]}</span>
          </li>
        ))}
      </ul>

      <div className="iface-add">
        <label className="iface-add-field">
          <span>Protocol</span>
          <select value={busType} onChange={(e) => setBusType(e.target.value as BusType)}>
            {BUSES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label className="iface-add-field" title="Client: the side other instances' Secondary interfaces connect into. Secondary: connects INTO a Client interface elsewhere — not a network client/server pairing.">
          <span>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="client">Client</option>
            <option value="secondary" disabled={def.designType === "hierarchical"}>Secondary</option>
          </select>
        </label>
        <label className="iface-add-field" title="Standard: a normal bus interface. Data Source: this instance itself supplies the data (e.g. a BISR controller's pd list) rather than just carrying the bus through.">
          <span>Kind</span>
          <select value={isDS ? "ds" : "iface"} onChange={(e) => setIsDS(e.target.value === "ds")}>
            <option value="iface">Standard</option>
            <option value="ds">Data Source</option>
          </select>
        </label>
        {/* if 名 / pd 各占整行满宽（名字可能很长）；下拉建议来自当前文档已用值 */}
        {role === "secondary" && (
          <label className="full">
            <span>Name</span>
            <input list="sg-if" placeholder="if name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        {busType === "BISR" && (
          <label className="full">
            <span>Power domain</span>
            <input list="sg-pd" placeholder="pd (optional)" value={pd} onChange={(e) => setPd(e.target.value)} />
          </label>
        )}
        {busType === "BISR" && (
          <label className="full chk"><input type="checkbox" checked={pdMatchOnly} onChange={(e) => setPdMatchOnly(e.target.checked)} /> pd match only (port name omits pd)</label>
        )}
        {busType === "SSN" && (
          <label className="iface-add-field">
            <span>Width</span>
            <input type="number" min={1} placeholder="width" value={width} onChange={(e) => setWidth(e.target.value)} />
          </label>
        )}
        {busType === "BSCAN" && (
          <label className="iface-add-field">
            <span>Variant</span>
            <select value={variant} onChange={(e) => setVariant(e.target.value as "DC" | "AC")}>
              <option value="DC">DC</option>
              <option value="AC">AC</option>
            </select>
          </label>
        )}
        <button onClick={add} disabled={!!blockedReason} title={blockedReason ?? "Add this interface"}>
          ＋ Interface
        </button>
        {blockedReason && <div className="iface-add-blocked full">{blockedReason}</div>}
      </div>
      <IfaceDatalists />
    </InspectorSection>
  );
}

function PdChips({ value, options, onChange }: { value: string[]; options: string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const v = raw.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setText("");
  };
  return (
    <div className="pd-chips">
      <div className="pd-chip-row">
        {value.map((pd) => (
          <span key={pd} className="pd-chip">{pd}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== pd))}>×</button>
          </span>
        ))}
      </div>
      <input
        list="pd-name-options"
        value={text}
        placeholder="pd name + Enter"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(text); } }}
        onBlur={() => add(text)}
      />
      <datalist id="pd-name-options">{options.map((o) => <option key={o} value={o} />)}</datalist>
    </div>
  );
}

/** 选中某个接口时的右栏：可改参数 + 改所在边 + 删除 + 配对状态 + 展开信号。 */
function InterfaceInspector({ openDef, inst, idef, iface }: { openDef: HardenDef; inst: HardenInstance; idef: HardenDef; iface: BusInterface }) {
  const doc = useStore((s) => s.doc);
  const updateInterface = useStore((s) => s.updateInterface);
  const setDataSource = useStore((s) => s.setDataSource);
  const setInterfacePlacement = useStore((s) => s.setInterfacePlacement);
  const removeInterface = useStore((s) => s.removeInterface);
  const setInterfaceEdge = useStore((s) => s.setInterfaceEdge);
  const setInstanceIfacePd = useStore((s) => s.setInstanceIfacePd);
  const select = useStore((s) => s.select);

  const guard = (fn: () => void) => {
    try { fn(); } catch (e: any) { notify(e?.message ?? String(e)); }
  };
  const patch = (p: Partial<BusInterface>) => guard(() => updateInterface(idef.id, iface.id, p));
  const side = resolveSide(iface);

  const conn = openDef.connections.find(
    (c) =>
      (c.secondaryInstanceId === inst.id && c.secondaryInterfaceId === iface.id) ||
      (c.clientInstanceId === inst.id && c.clientInterfaceId === iface.id),
  );
  let pairedTo = "Unpaired";
  if (conn) {
    const otherInstId = conn.secondaryInstanceId === inst.id ? conn.clientInstanceId : conn.secondaryInstanceId;
    const otherIfId = conn.secondaryInstanceId === inst.id ? conn.clientInterfaceId : conn.secondaryInterfaceId;
    const oi = openDef.childInstances.find((i) => i.id === otherInstId);
    pairedTo = `${oi?.instanceName ?? otherInstId} / ${otherIfId}`;
  }
  const sigs = expandInterface(iface);

  return (
    <InspectorShell id="gc-inspector" className="gc-inspector-shell" style={{ width: "var(--right-w, 300px)" }}>
      <InspectorBody>
      <button className="link-back" onClick={() => select({ kind: "instance", id: inst.id })}>← {inst.instanceName}</button>
      <InspectorSection title="Interface">
        <InspectorField label="busType" hint="(the protocol this interface speaks)">
          <select
            value={iface.busType}
            onChange={(e) => {
              const bt = e.target.value as BusType;
              const p: Partial<BusInterface> = { busType: bt };
              // BISR 的 pd 可选：改成 BISR 不再强制 pd0（留空 → 信号名不带 <pd>_）
              if (bt === "SSN" && !iface.busWidth) p.busWidth = 4;
              if (bt === "BSCAN" && !iface.bscanVariant) p.bscanVariant = "DC";
              patch(p);
            }}
          >
            {BUSES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </InspectorField>
        <InspectorField label="role" hint="(Client: what others connect into. Secondary: connects into a Client elsewhere — not a network client/server pair)">
          <select value={iface.role} onChange={(e) => patch({ role: e.target.value as Role })}>
            <option value="client">Client</option>
            <option value="secondary" disabled={idef.designType === "hierarchical"}>Secondary</option>
          </select>
        </InspectorField>
        <InspectorField label="Kind" hint="(Data Source: this instance itself supplies the data, e.g. a BISR controller's pd list)">
          <select value={iface.isDataSource ? "ds" : "iface"} onChange={(e) => setDataSource(idef.id, iface.id, e.target.value === "ds")}>
            <option value="iface">Standard</option>
            <option value="ds">Data Source</option>
          </select>
        </InspectorField>
        {iface.role === "secondary" && (
          <InspectorField label="Name">
            <input
              list="sg-if"
              defaultValue={iface.interfaceName ?? ""}
              key={iface.id + "n" + (iface.interfaceName ?? "")}
              onBlur={(e) => e.target.value !== (iface.interfaceName ?? "") && patch({ interfaceName: e.target.value || "if" })}
            />
          </InspectorField>
        )}
        {iface.busType === "SSN" && (
          <InspectorField label="Width">
            <input
              type="number"
              min={1}
              defaultValue={iface.busWidth ?? 4}
              key={iface.id + "w" + (iface.busWidth ?? 4)}
              onBlur={(e) => {
                const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                if (v !== (iface.busWidth ?? 4)) patch({ busWidth: v });
              }}
            />
          </InspectorField>
        )}
        {iface.busType === "BISR" && (
          <InspectorField label="pd" hint="(optional, empty = no pd_ prefix)">
            <input
              list="sg-pd"
              defaultValue={iface.powerDomain ?? ""}
              key={iface.id + "p" + (iface.powerDomain ?? "")}
              onBlur={(e) => e.target.value !== (iface.powerDomain ?? "") && patch({ powerDomain: e.target.value || undefined })}
            />
          </InspectorField>
        )}
        {iface.busType === "BISR" && (
          <label className="chk-row">
            <input type="checkbox" checked={!!iface.pdMatchOnly} onChange={(e) => patch({ pdMatchOnly: e.target.checked || undefined })} />
            pd match only (port name omits pd)
          </label>
        )}
        {iface.busType === "BISR" && (
          <InspectorField label="This instance's pd" hint="(override · match only · not in port name)">
            <input
              list="sg-pd"
              defaultValue={inst.ifacePd?.[iface.id] ?? ""}
              key={inst.id + iface.id + "ipd" + (inst.ifacePd?.[iface.id] ?? "")}
              onBlur={(e) => e.target.value !== (inst.ifacePd?.[iface.id] ?? "") && guard(() => setInstanceIfacePd(inst.id, iface.id, e.target.value || undefined))}
            />
          </InspectorField>
        )}
        {iface.busType === "BSCAN" && (
          <InspectorField label="variant">
            <select value={iface.bscanVariant ?? "DC"} onChange={(e) => patch({ bscanVariant: e.target.value as "DC" | "AC" })}>
              <option value="DC">DC</option>
              <option value="AC">AC</option>
            </select>
          </InspectorField>
        )}
        {((iface.isDataSource && iface.role === "client") || (iface.busType === "JTAG1838" && iface.role === "secondary")) && (
          <InspectorField label="Placement">
            <select
              value={iface.placement ?? "pin"}
              onChange={(e) => setInterfacePlacement(idef.id, iface.id, e.target.value === "other" ? "other" : "pin")}
            >
              <option value="pin">pin (on edge)</option>
              <option value="other">{DS_LABEL[iface.busType]} (internal)</option>
            </select>
          </InspectorField>
        )}
        {iface.busType === "BISR" && iface.isDataSource && iface.placement === "other" && (
          <InspectorField label="PD List">
            <PdChips
              value={iface.pdList ?? []}
              options={usedPdNames(doc.library.defs)}
              onChange={(next) => patch({ pdList: next.length ? next : undefined })}
            />
          </InspectorField>
        )}
        {idef.vertices?.length ? (
          <div className="kv"><span>Edge</span><b className="muted">{SIDE_LABEL[side]} (along outline · drag interface to move)</b></div>
        ) : (
          <InspectorField label="Edge">
            <select value={side} onChange={(e) => guard(() => setInterfaceEdge(idef.id, iface.id, e.target.value as SideV, iface.edge?.offset ?? 0.5))}>
              {SIDES.map((s) => <option key={s.v} value={s.v}>{s.t}</option>)}
            </select>
          </InspectorField>
        )}
        <div className="kv"><span>Location</span><b>{inst.instanceName} : {idef.designName}</b></div>
        <div className="kv"><span>Paired</span><b className={conn ? "ok" : "muted"}>{pairedTo}</b></div>
      </InspectorSection>

      <InspectorSection title={<>Expanded Signals ({sigs.length})</>}>
        <pre className="iface-sigs">{sigs.map((s) => `${s.direction === "input" ? "in " : "out"} ${s.name}`).join("\n")}</pre>
      </InspectorSection>

      <InspectorSection className="insp-actions">
        <button className="danger" onClick={() => guard(() => { removeInterface(idef.id, iface.id); select({ kind: "instance", id: inst.id }); })}>Delete This Interface</button>
      </InspectorSection>
      <IfaceDatalists />
      </InspectorBody>
    </InspectorShell>
  );
}

export function Inspector() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const renameInstance = useStore((s) => s.renameInstance);
  const updateDefAttrs = useStore((s) => s.updateDefAttrs);
  const saveDefToLibrary = useStore((s) => s.saveDefToLibrary);
  const drillInto = useStore((s) => s.drillInto);
  const deleteInstance = useStore((s) => s.deleteInstance);
  const selectInterface = useStore((s) => s.selectInterface);

  const guard = (fn: () => void) => {
    try {
      fn();
    } catch (e: any) {
      notify(e?.message ?? String(e));
    }
  };

  // 选中接口：可编辑参数 + 改边 + 删除 + 配对状态 + 展开信号
  if (selection.kind === "interface" && selection.instId && selection.id) {
    const openDef = doc.library.defs.find((d) => d.id === doc.ui.openDefId);
    const inst = openDef?.childInstances.find((i) => i.id === selection.instId);
    const idef = inst && doc.library.defs.find((d) => d.id === inst.hardenId);
    const iface = idef?.interfaces.find((i) => i.id === selection.id);
    if (!openDef || !inst || !idef || !iface) {
      return <InspectorShell id="gc-inspector" className="gc-inspector-shell" style={{ width: "var(--right-w, 300px)" }}><div className="insp-empty">(Interface no longer exists)</div></InspectorShell>;
    }
    return <InterfaceInspector openDef={openDef} inst={inst} idef={idef} iface={iface} />;
  }

  if (selection.kind !== "instance") {
    return <InspectorShell id="gc-inspector" className="gc-inspector-shell" style={{ width: "var(--right-w, 300px)" }}><div className="insp-empty">Select a harden to view / edit its properties</div></InspectorShell>;
  }

  const open = doc.library.defs.find((d) => d.id === doc.ui.openDefId);
  const inst = open?.childInstances.find((i) => i.id === selection.id);
  const def = inst && doc.library.defs.find((d) => d.id === inst.hardenId);
  if (!inst || !def) {
    return <InspectorShell id="gc-inspector" className="gc-inspector-shell" style={{ width: "var(--right-w, 300px)" }}><div className="insp-empty">(Selected object no longer exists)</div></InspectorShell>;
  }

  return (
    <InspectorShell id="gc-inspector" className="gc-inspector-shell" style={{ width: "var(--right-w, 300px)" }}>
      <InspectorBody>
      <InspectorSection title="Instance" className="insp-section-this">
        <div className="insp-section-scope">This instance only</div>
        <InspectorField label="Instance Name">
          <input
            defaultValue={inst.instanceName}
            key={inst.id + inst.instanceName}
            onBlur={(e) => e.target.value !== inst.instanceName && guard(() => renameInstance(inst.id, e.target.value))}
          />
        </InspectorField>
      </InspectorSection>

      {/* Everything below is the SHARED module definition, not this one placement — a distinct
          tinted wrapper (not just a parenthetical) so an edit here doesn't read as "just renaming
          this box" when it silently changes every other instance of {designName} in the design. */}
      <InspectorSection title={<>Module Definition <small>(Changes affect all {def.designName} instances)</small></>}
                         className="insp-section-shared">
        <InspectorField label="designName">
          <input
            defaultValue={def.designName}
            key={def.id + def.designName}
            onBlur={(e) => e.target.value !== def.designName && guard(() => updateDefAttrs(def.id, { designName: e.target.value }))}
          />
        </InspectorField>
        <InspectorField label="designLevel" hint="(chip: the whole design. physical_block: a placeable sub-block — required to appear in the DFTSpec Planner. sub_block: a logical grouping, not independently placeable)">
          <select value={def.designLevel} onChange={(e) => guard(() => updateDefAttrs(def.id, { designLevel: e.target.value as DesignLevel }))}>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </InspectorField>
        <InspectorField label="designType" hint="(tiling: placeable as a repeated physical block. hierarchical: a logical grouping only — cannot have Secondary interfaces)">
          <select value={def.designType} onChange={(e) => guard(() => updateDefAttrs(def.id, { designType: e.target.value as DesignType }))}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </InspectorField>
        <InspectorField label="fileName" hint="(empty = fallback path)">
          <input
            defaultValue={def.fileName ?? ""}
            key={def.id + (def.fileName ?? "")}
            placeholder={`../../design/${def.designName}/${def.designName}.v`}
            onBlur={(e) => guard(() => updateDefAttrs(def.id, { fileName: e.target.value || undefined }))}
          />
        </InspectorField>
        <div className="def-color">
          <span>Color</span>
          <div className="swatches">
            {DEF_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${def.color === c ? " on" : ""}`}
                style={{ background: c }}
                title={c}
                onClick={() => guard(() => updateDefAttrs(def.id, { color: c }))}
              />
            ))}
            <input
              type="color"
              className="swatch-pick"
              title="Custom color"
              value={def.color ?? "#2e90fa"}
              onChange={(e) => guard(() => updateDefAttrs(def.id, { color: e.target.value }))}
            />
            <button
              type="button"
              className={`swatch swatch-none${!def.color ? " on" : ""}`}
              title="Default (no color)"
              onClick={() => guard(() => updateDefAttrs(def.id, { color: undefined }))}
            >×</button>
          </div>
        </div>
      </InspectorSection>

      <InterfaceEditor def={def} onError={guard} onPick={(ifId) => selectInterface(inst.id, ifId)} />

      <InspectorSection className="insp-actions">
        {!def.inLibrary && (
          <button onClick={() => void promptText("Save to module library, module name:", def.designName).then((name) => {
            if (name) guard(() => saveDefToLibrary(def.id, name));
          })}>Save to Library</button>
        )}
        {def.inLibrary && <span className="muted">Already in library</span>}
        <button onClick={() => drillInto(inst.id, def.id)}>Enter This Module ▸</button>
        <button onClick={() => {
          useStore.getState().addToSpecgen(def.id);
          useDesign.getState().setWorkspace("specgen");
        }}>Add to DFTSpec Planner ▸</button>
        <button className="danger" onClick={() => deleteInstance(inst.id)}>Delete This Instance</button>
      </InspectorSection>
      </InspectorBody>
    </InspectorShell>
  );
}
