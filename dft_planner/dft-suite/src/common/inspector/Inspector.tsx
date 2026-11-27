// 统一 Inspector 骨架(spec §9):三种积木——分区(标题+副信息)、字段行、列表行——加外壳。
// 纯展示型;各面板把自己的 input/按钮逻辑作为 children 传入。
import type { CSSProperties, ReactNode } from "react";

export function InspectorShell({ id, className, style, children, ...rest }: {
  id?: string; className?: string; style?: CSSProperties; children: ReactNode;
} & Record<string, unknown>) {
  return <aside id={id} className={"inspector" + (className ? " " + className : "")} style={style} {...rest}>{children}</aside>;
}

export function InspectorBody({ children }: { children: ReactNode }) {
  return <div className="inspector-body">{children}</div>;
}

export function InspectorSection({ title, meta, className, children }: {
  title?: ReactNode; meta?: ReactNode; className?: string; children?: ReactNode;
}) {
  return (
    <div className={"insp-section" + (className ? " " + className : "")}>
      {(title != null || meta != null) && (
        <div className="insp-section-head">
          {title != null && <span className="insp-section-title">{title}</span>}
          {meta != null && <span className="insp-section-meta">{meta}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export function InspectorField({ label, hint, children }: {
  label: ReactNode; hint?: ReactNode; children: ReactNode;
}) {
  return (
    <label className="insp-field">
      <span className="insp-field-label">{label}{hint != null && <small>{hint}</small>}</span>
      {children}
    </label>
  );
}

export function InspectorRow({ selected, onClick, onDoubleClick, title, children, actions, ...rest }: {
  selected?: boolean; onClick?: () => void; onDoubleClick?: () => void; title?: string;
  children: ReactNode; actions?: ReactNode;
} & Record<string, unknown>) {
  return (
    <li
      className={"insp-row" + (selected ? " sel" : "")}
      onClick={onClick} onDoubleClick={onDoubleClick} title={title}
      {...rest}
    >
      {children}
      {actions != null && <span className="insp-row-actions">{actions}</span>}
    </li>
  );
}
