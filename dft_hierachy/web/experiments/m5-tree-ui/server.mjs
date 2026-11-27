import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";

export async function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const file = {
        "/": "index.html",
        "/app.js": "app.js",
        "/style.css": "style.css",
        "/app.js.map": "app.js.map",
      }[pathname];
      if (!file) {
        res.writeHead(404).end();
        return;
      }
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".map": "application/json",
      };
      res.setHeader("Content-Type", types[extname(file)]);
      res.end(await readFile(resolve("dist", file)));
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const server = await startServer(4173);
  console.log(
    `Comparison: http://127.0.0.1:${server.address().port}/?mode=virtual (or mode=arborist)`,
  );
}
