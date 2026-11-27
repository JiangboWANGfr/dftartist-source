import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["app.jsx"],
  bundle: true,
  outfile: "dist/app.js",
  format: "esm",
  sourcemap: true,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
await copyFile("index.html", "dist/index.html");
await copyFile("style.css", "dist/style.css");
