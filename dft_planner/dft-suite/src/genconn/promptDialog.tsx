// 应用内文本输入对话框，替代 window.prompt（Electron 禁用了 prompt()，会静默返回 null）。
// 命令式用法：const name = await promptText("提示", "默认值"); 取消返回 null。
// 浏览器与 Electron 均可用，样式统一。

import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";

function PromptModal({
  message,
  defaultValue,
  onDone,
}: {
  message: string;
  defaultValue: string;
  onDone: (value: string | null) => void;
}) {
  const [val, setVal] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <div className="gc-prompt-overlay" onMouseDown={() => onDone(null)}>
      <div className="gc-prompt-box" onMouseDown={(e) => e.stopPropagation()}>
        <div className="gc-prompt-msg">{message}</div>
        <input
          ref={inputRef}
          className="gc-prompt-input"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onDone(val);
            else if (e.key === "Escape") onDone(null);
          }}
        />
        <div className="gc-prompt-actions">
          <button onClick={() => onDone(null)}>Cancel</button>
          <button className="primary" onClick={() => onDone(val)}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export function promptText(message: string, defaultValue = ""): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (value: string | null) => {
      root.unmount();
      host.remove();
      resolve(value);
    };
    root.render(<PromptModal message={message} defaultValue={defaultValue} onDone={done} />);
  });
}
