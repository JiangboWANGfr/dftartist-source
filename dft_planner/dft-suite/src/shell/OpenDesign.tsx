import { useDesign } from "../store/design.ts";

export function OpenDesign() {
  const status = useDesign(s => s.status);
  const top = useDesign(s => s.top);
  const filelist = useDesign(s => s.filelist);

  const label = status === "ready" && top
    ? top
    : status === "ready" && filelist
    ? filelist.split("/").pop() ?? "Opened"
    : "Open Design";

  async function handleClick() {
    const pick = window.dft?.design?.pickFilelist;
    if (!pick) return;
    const fl = await pick();
    if (fl) {
      useDesign.getState().openDesign({ filelist: fl });
    }
  }

  return (
    <button className="tbtn primary" onClick={handleClick}>
      {label} <span className="chev">▾</span>
    </button>
  );
}
