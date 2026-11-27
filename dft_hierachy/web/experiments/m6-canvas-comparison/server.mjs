import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
export async function startServer(port = 0) {
  const allowed = new Set([
    "react.html",
    "sprotty.html",
    "react.js",
    "sprotty.js",
    "react.js.map",
    "sprotty.js.map",
    "style.css",
    "worker.js",
    "stall-worker.js",
    "crash-worker.js",
  ]);
  const server = createServer(async (req, res) => {
    const name = new URL(req.url, "http://localhost").pathname.slice(1);
    if (!allowed.has(name)) {
      res.writeHead(404).end();
      return;
    }
    try {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
      );
      res.setHeader(
        "Content-Type",
        name.endsWith("html") ? "text/html" : name.endsWith("css") ? "text/css" : "text/javascript",
      );
      res.end(await readFile(`dist/${name}`));
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = await startServer(4176);
  console.log(`http://127.0.0.1:${server.address().port}/react.html (or /sprotty.html)`);
}
