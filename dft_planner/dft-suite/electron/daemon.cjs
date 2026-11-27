// Plain-Node client for the pyslang hierarchy daemon (no Electron import -> unit-testable).
// Spawns tools/hierarchy_daemon.py, talks NDJSON over stdio, correlates responses by id.

const { spawn } = require("node:child_process");
const path = require("node:path");

class DaemonClient {
  /** @param {{python?:string,filelist:string,vars?:Record<string,string>,substs?:[string,string][],top?:string|null,cwd?:string}} opts */
  constructor(opts = {}) {
    // Opt-in C++ engine (hdl serve) when HDL_ENGINE is set; else the pyslang daemon.
    const engine = opts.engine || process.env.HDL_ENGINE;
    let cmd, args;
    if (engine) {
      cmd = engine;
      args = ["serve", opts.filelist];
    } else {
      cmd = opts.python || process.env.HS_PYTHON || "python3";
      args = [path.join(__dirname, "..", "tools", "hierarchy_daemon.py"), opts.filelist];
    }
    for (const [k, v] of Object.entries(opts.vars || {})) args.push("--var", `${k}=${v}`);
    for (const [a, b] of opts.substs || []) args.push("--subst", `${a}=${b}`);
    if (opts.top) args.push("--top", opts.top);

    this.proc = spawn(cmd, args, { cwd: opts.cwd });
    this.pending = new Map();
    this.nextId = 0;
    this._buf = "";
    this._stderr = "";
    this._readyRes = null;
    this._readyRej = null;
    this.readyP = new Promise((res, rej) => { this._readyRes = res; this._readyRej = rej; });

    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (d) => this._onData(d));
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (d) => { this._stderr += d; });
    this.proc.on("error", (e) => this._fail(e));
    this.proc.on("exit", (code) => {
      if (code !== 0 && code !== null) this._fail(new Error(`daemon exited ${code}: ${this._stderr.slice(-800)}`));
      else this._fail(new Error("daemon closed"));
    });
  }

  _fail(err) {
    if (this._readyRej) { this._readyRej(err); this._readyRes = this._readyRej = null; }
    for (const { reject } of this.pending.values()) reject(err);
    this.pending.clear();
  }

  _onData(chunk) {
    this._buf += chunk;
    let i;
    while ((i = this._buf.indexOf("\n")) >= 0) {
      const line = this._buf.slice(0, i);
      this._buf = this._buf.slice(i + 1);
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.event === "ready") {
        if (this._readyRes) { this._readyRes(obj); this._readyRes = this._readyRej = null; }
        continue;
      }
      if (obj.id != null && this.pending.has(obj.id)) {
        const { resolve, reject } = this.pending.get(obj.id);
        this.pending.delete(obj.id);
        if (obj.error) reject(Object.assign(new Error(obj.error.message), { code: obj.error.code }));
        else resolve(obj.result);
      } else if (obj.id == null && obj.error && this._readyRej) {
        // unsolicited startup error (e.g. compile failure) before ready
        this._readyRej(Object.assign(new Error(obj.error.message), { code: obj.error.code }));
        this._readyRes = this._readyRej = null;
      }
    }
  }

  ready() { return this.readyP; }

  query(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      if (!this.proc || this.proc.killed) { reject(new Error("daemon not running")); return; }
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }

  dispose() {
    try { this.proc.stdin.end(); } catch { /* ignore */ }
    try { this.proc.kill(); } catch { /* ignore */ }
  }
}

module.exports = { DaemonClient };
