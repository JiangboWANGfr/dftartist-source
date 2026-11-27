// In-app notifications replacing window.alert/confirm.
// window.alert/confirm are renderer-blocking native dialogs; under WSLg / remote X they can
// wedge the whole UI (observed in the field). notify() is a non-blocking toast; appConfirm()
// routes through the main process's native message box (async, never blocks the renderer loop).

/** Non-blocking toast, top-right. Click to dismiss; auto-dismisses after 8s. */
export function notify(msg: string): void {
  let host = document.getElementById("notify-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "notify-host";
    document.body.appendChild(host);
  }
  const item = document.createElement("div");
  item.className = "notify-item";
  item.textContent = msg;
  item.title = "Click to dismiss";
  item.onclick = () => item.remove();
  host.appendChild(item);
  setTimeout(() => item.remove(), 8000);
}

/** OK/Cancel confirmation via the main process (native dialog). Falls back to window.confirm in browser dev. */
export async function appConfirm(msg: string): Promise<boolean> {
  // e2e hook: main-process dialogs can't be driven by Playwright's page.on("dialog"),
  // so tests install window.__e2eConfirm to script and observe confirmations.
  const hook = (window as any).__e2eConfirm;
  if (hook) return hook(msg);
  const c = (window as any).dft?.app?.confirm;
  if (c) return c(msg);
  return window.confirm(msg);
}
