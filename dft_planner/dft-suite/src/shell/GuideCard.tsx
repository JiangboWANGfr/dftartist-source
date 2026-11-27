// 通用空态引导卡：图标 + 标题 + 可选三步流程 + 主按钮。SpecGen 空态先用，后续 P2/P3 复用。
type Step = { n: number; text: string };

export function GuideCard(props: {
  icon: string;
  title: string;
  steps?: Step[];
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="guide-card" data-guide="card">
      <div className="guide-icon">{props.icon}</div>
      <div className="guide-title">{props.title}</div>
      {props.steps && (
        <div className="guide-steps">
          {props.steps.map((s) => (
            <div key={s.n} className="guide-step">
              <span className="guide-step-n">{s.n}</span>
              <span>{s.text}</span>
            </div>
          ))}
        </div>
      )}
      {props.actionLabel && (
        <button className="guide-action" onClick={props.onAction}>{props.actionLabel}</button>
      )}
    </div>
  );
}
