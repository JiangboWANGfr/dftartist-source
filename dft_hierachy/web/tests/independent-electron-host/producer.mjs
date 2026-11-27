// B-owned byte producer, not Core or a transport implementation.
import net from "node:net";
import { createInterface } from "node:readline";
const socket = net.connect({ host: "127.0.0.1", port: Number(process.env.B_HOST_PORT) });
const send = (value) => socket.write(JSON.stringify(value) + "\n");
const lines = createInterface({ input: socket });
socket.once("connect", () => send({ ready: true, pid: process.pid }));
lines.on("line", (line) => {
  const c = JSON.parse(line);
  if (c.op === "bytes")
    process.stdout.write(Buffer.from(c.base64, "base64"), () => send({ ack: c.id }));
  else if (c.op === "exit") {
    process.exitCode = c.code ?? 0;
    process.stdout.end();
    process.stdin.destroy();
    socket.end();
  } else if (c.op === "ignore-eof") {
    globalThis.keepAlive = setInterval(() => {}, 1000);
    send({ ack: c.id });
  }
});
createInterface({ input: process.stdin }).on("line", (line) => send({ stdin: line }));
process.stdin.on("end", () => {
  if (!globalThis.keepAlive) {
    process.stdout.end();
    socket.end();
  }
});
process.stdout.on("error", () => {});
socket.on("error", () => {});
