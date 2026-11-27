import { useDesign } from "../store/design.ts";

export function ThemeToggle() {
  const theme = useDesign(s => s.theme);
  function toggle() {
    const current = useDesign.getState().theme;
    useDesign.getState().setTheme(current === "dark" ? "light" : "dark");
  }
  return (
    <button id="theme-toggle" className="iconbtn" onClick={toggle} title="Toggle theme">
      {theme === "dark" ? "☀" : "🌙"}
    </button>
  );
}
