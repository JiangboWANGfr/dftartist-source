import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true, open: false },
  // NEVER empty dist on build. The app is run FROM dist (electron loads dist/index.html), and
  // a rebuild while a session is open used to DELETE the very files that session's renderer
  // lazy-loads — every dynamic import 404'd and the live app went dead ("用着用着全坏了").
  // Hashed filenames make stale files harmless; the running session keeps its version, the
  // next launch picks up the new index.html. Prune dist manually if it ever grows too big.
  build: { emptyOutDir: false },
}));
