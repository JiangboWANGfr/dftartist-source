// 左栏·设计层次：从共享 daemon (dftDesign.dump) 自动加载，或导入离线 JSON。
// 拖拽用 HTML5 DnD：dragstart 把实例 id 塞进 dataTransfer；落点处理在 CanvasView。

import { useEffect, useMemo, useState } from "react";
import { useStore } from "./store.ts";
import { useDesign } from "../store/design.ts";
import { fsOpen } from "./persist.ts";
import { parseHierarchy, searchHierarchy, nodeToPayload, type DesignHierarchy } from "./hierarchy.ts";
import { dftDesign } from "../core-bridge/client.ts";
import { notify } from "../common/notify.ts";

/** 拖拽 payload 的自定义 MIME（避免误拦其它拖放）。 */
export const HIER_DND_MIME = "application/x-genconn-hier";

function HierNode({ h, id, depth, expanded, toggle, ancestors }: {
  h: DesignHierarchy;
  id: string;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  ancestors: Set<string>; // 到本节点路径上的祖先 id —— 遇到成环的 child 就不再下钻（防无限递归崩溃）
}) {
  const node = h.instances[id];
  if (!node) return null;
  const def = h.definitions[node.definitionId];
  const designName = def?.designName ?? node.definitionId;
  const isOpen = expanded.has(id);
  const title = `Drag to canvas: ${node.instanceName} (${designName})${def?.filePath ? `\n${def.filePath}` : ""}`;

  return (
    <li>
      <div
        className="hier-row"
        data-gc-node={id}
        style={{ paddingLeft: 4 + depth * 12 }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(HIER_DND_MIME, id);
          e.dataTransfer.effectAllowed = "copy";
        }}
        title={title}
      >
        {node.isLeaf ? (
          <span className="hier-twist leaf">·</span>
        ) : (
          <span className="hier-twist" onClick={(e) => { e.stopPropagation(); toggle(id); }}>
            {isOpen ? "▾" : "▸"}
          </span>
        )}
        <span className="hier-inst">{node.instanceName}</span>
        <span className="hier-def">{designName}</span>
      </div>
      {isOpen && !node.isLeaf && (
        <ul className="hier-children">
          {node.childInstanceIds
            .filter((cid) => cid !== id && !ancestors.has(cid)) // 成环的 child 不再下钻
            .map((cid) => (
              <HierNode key={cid} h={h} id={cid} depth={depth + 1} expanded={expanded} toggle={toggle} ancestors={new Set([...ancestors, id])} />
            ))}
        </ul>
      )}
    </li>
  );
}

export function HierarchyPanel() {
  const hierarchy = useStore((s) => s.hierarchy);
  const loadHierarchy = useStore((s) => s.loadHierarchy);
  const importBlocks = useStore((s) => s.importBlocks);
  const designStatus = useDesign((s) => s.status);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null); // 自动加载失败的面板内温和提示（不弹框）
  const [q, setQ] = useState("");
  const [dq, setDq] = useState(""); // 防抖后的 query（200ms，setTimeout 惯例同 Workspace.tsx）

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  const hits = useMemo(
    () => (hierarchy && dq.trim() ? searchHierarchy(hierarchy, dq) : []),
    [hierarchy, dq],
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // 单击命中行：展开到该节点（所有点前缀灌入 expanded），并滚动树行进入视野。
  const locate = (instId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const parts = instId.split(".");
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join("."));
      return next;
    });
    setTimeout(() => {
      document.querySelector(`[data-gc-node="${CSS.escape(instId)}"]`)?.scrollIntoView({ block: "center" });
    }, 0);
  };

  const afterLoad = (h: DesignHierarchy) => {
    loadHierarchy(h);
    setLoadError(null);
    setExpanded(new Set(h.rootInstanceIds)); // 默认展开顶层
  };

  // 共享设计 ready 时自动加载层次树（daemon 已解析，只需 dump）。
  // 失败不弹框：改成面板内温和提示 + 保留「导入 JSON」离线兜底入口。
  // 常见的「引擎侧无已打开设计」是 UI 与引擎状态不同步的边缘情况，单独给友好文案。
  useEffect(() => {
    if (designStatus !== "ready") { setLoadError(null); return; }
    let cancelled = false;
    setBusy(true);
    setLoadError(null);
    dftDesign.dump().then((raw) => {
      if (cancelled) return;
      try {
        afterLoad(parseHierarchy(JSON.stringify(raw)));
      } catch (e: any) {
        setLoadError(`Failed to parse hierarchy data: ${e?.message ?? e}`);
      }
    }).catch((e: any) => {
      if (cancelled) return;
      const msg = String(e?.message ?? e);
      setLoadError(/no design open/.test(msg)
        ? "Design hierarchy unavailable — please reopen the design, or click \"Import JSON\" above to load offline."
        : "Failed to load hierarchy; click \"Import JSON\" above to load offline.");
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designStatus]);

  // 离线兜底：导入 *.hierarchy.json 文件
  const onImportFile = async () => {
    const text = await fsOpen();
    if (text == null) return;
    try {
      afterLoad(parseHierarchy(text));
    } catch (e: any) {
      notify(`Failed to import hierarchy: ${e?.message ?? e}`);
    }
  };

  return (
    <aside className="panel left hier">
      <div className="lib-head">Design Hierarchy</div>
      <div className="hier-alt">
        <button className="hier-file" onClick={() => void onImportFile()} title="Import *.hierarchy.json offline">Import JSON</button>
      </div>
      {busy && <div className="hier-hint">Loading…</div>}
      {!hierarchy && !busy && loadError && (
        <div className="hier-hint">{loadError}</div>
      )}
      {!hierarchy && !busy && !loadError && designStatus !== "ready" && (
        <div className="hier-hint">Please open a design at the top first; the hierarchy tree will load automatically. You can also import an offline JSON. Drag an instance to the canvas to auto-create a block.</div>
      )}
      {hierarchy && (
        <>
          <input
            className="hier-search"
            data-dfx="hier-search"
            placeholder="Search instances/modules, supports *"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {dq.trim() !== "" && hits.length > 0 && (
            <ul className="hier-hits" data-dfx="hier-hits">
              {hits.map((hit) => (
                <li
                  key={hit.instId}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(HIER_DND_MIME, hit.instId);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => locate(hit.instId)}
                  onDoubleClick={() => importBlocks([nodeToPayload(hierarchy, hit.instId)])}
                  title={`Click to locate in tree / double-click to import to canvas / drag to canvas\n${hit.path}`}
                >
                  <span className="hier-inst">{hit.instanceName}</span>
                  <span className="hier-def">{hit.designName}</span>
                  <span className="hier-path">{hit.path}</span>
                </li>
              ))}
              {hits.length >= 200 && <li className="hier-hint">Truncated, keep typing</li>}
            </ul>
          )}
          <ul className="hier-tree">
            {hierarchy.rootInstanceIds.map((id) => (
              <HierNode key={id} h={hierarchy} id={id} depth={0} expanded={expanded} toggle={toggle} ancestors={new Set()} />
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
