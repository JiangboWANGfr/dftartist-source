"use strict";
// Bridge to dft-core CLI binaries (hdl, genconn, ctrlgen).
// All functions return normalised JS objects matching the bridge contract.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveBin } = require("./bin.cjs");

let specgenUid = 0; // 同毫秒内并发 specgen 调用（分域生成 SSN/BSCAN）临时文件名去重

/** Spawn a binary, collect stdout/stderr, resolve on exit 0 else reject. */
function run(bin, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(resolveBin(bin), args);
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", reject);
    p.on("close", (c) => {
      if (c === 0) resolve(out);
      else reject(new Error(`${bin} ${args.join(" ")} exit ${c}: ${err.slice(-800)}`));
    });
    if (input != null) { p.stdin.write(input); p.stdin.end(); }
  });
}

/**
 * hdl dump <filelist> [--top <top>]
 * Returns the raw parsed JSON object.
 */
async function hdlDump(filelist, top) {
  const args = ["dump", filelist];
  if (top) args.push("--top", top);
  const raw = await run("hdl", args);
  // hdl writes a summary line to stderr and the JSON to stdout.
  // stdout may have a trailing newline; JSON.parse handles that.
  return JSON.parse(raw);
}

/**
 * Parse the ===FILE:<name>===\n<content> multi-file format emitted by
 * `genconn generate-all`.  Returns [{name, text}, ...].
 */
function parseFileMarkers(raw) {
  const files = [];
  const markerRe = /^===FILE:(.+)===/m;
  const parts = raw.split(/^(?====FILE:)/m);
  for (const part of parts) {
    const m = markerRe.exec(part);
    if (!m) continue;
    const name = m[1];
    const text = part.slice(m[0].length).replace(/^\r?\n/, "");
    files.push({ name, text });
  }
  return files;
}

/**
 * genconn generate-all <doc.json>
 * Contract: { files: {name:string, text:string}[], unconnected: string[] }
 *
 * The CLI outputs a custom text format with ===FILE:<path>===\n<content> markers.
 * "unconnected" is not emitted by the CLI; we always return [].
 */
async function genconnGenerateAll(docJson) {
  const tmp = path.join(os.tmpdir(), `gc-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmp, docJson);
  try {
    const raw = await run("genconn", ["generate-all", tmp]);
    const files = parseFileMarkers(raw);
    return { files, unconnected: [] };
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

/**
 * ctrlgen gen <spec.json>
 * Contract: { files: {name:string, text:string}[] }  (DFX ctrl IP 三件套: .v/.icl/.tcl)
 *
 * The CLI outputs the same ===FILE:<name>===\n<content> marker format as genconn.
 */
async function ctrlgenGen(spec) {
  const tmp = path.join(os.tmpdir(), `ctrlgen-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(spec));
  try {
    const raw = await run("ctrlgen", ["gen", tmp]);
    return { files: parseFileMarkers(raw) };
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

/**
 * specgen gen <doc.json>
 * Contract: returns the .spec text (single file, no ===FILE:=== markers).
 *
 * docJson is a pre-serialized JSON string (mirrors genconnGenerateAll).
 */
async function specgenGen(docJson) {
  const tmp = path.join(os.tmpdir(), `specgen-${process.pid}-${Date.now()}-${specgenUid++}.json`);
  fs.writeFileSync(tmp, docJson);
  try {
    return await run("specgen", ["gen", tmp]);
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

/**
 * specgen fragment <frag.json>  where frag.json = {ipType, instanceName, config}
 * Contract: returns the single .spec fragment text (`CompName (instanceName) { ... }`).
 *
 * fragJson is a pre-serialized JSON string (mirrors specgenGen).
 */
async function specgenFragment(fragJson) {
  const tmp = path.join(os.tmpdir(), `specgenfrag-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmp, fragJson);
  try { return await run("specgen", ["fragment", tmp]); }
  finally { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
}

/**
 * genconn inject <doc.json> <netlist.v>  (one file at a time)
 * Contract: vFiles is {path:string, text:string}[], returns {path,text}[].
 *
 * The CLI takes ONE .v file per invocation and writes the modified Verilog to stdout.
 * We write each vFile to a temp dir, call inject once per file, collect results.
 */
async function genconnInject(docJson, vFiles) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gc-"));
  try {
    const doc = path.join(dir, "doc.json");
    fs.writeFileSync(doc, docJson);
    const results = [];
    // Sequential loop: each .v file is processed one at a time; basenames must be unique within a call to avoid temp-dir collisions.
    for (const vf of vFiles) {
      const tmpV = path.join(dir, path.basename(vf.path));
      fs.writeFileSync(tmpV, vf.text);
      const text = await run("genconn", ["inject", doc, tmpV]);
      results.push({ path: vf.path, text });
    }
    return results;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * pad table -f <filelist> --lib <celllib> --json
 * Returns the parsed table object {pads, ssn, warnings}.
 */
async function padTable(filelist, lib) {
  const raw = await run("pad", ["table", "-f", filelist, "--lib", lib, "--json"]);
  return JSON.parse(raw);
}

/**
 * pad gen -f <filelist> --lib <celllib> [--config <tmp>] --level <L> [--aux <A>]
 * cfg: overlay object (may be null). Returns raw generated text (stdout).
 */
async function padGen(filelist, lib, cfg, level, aux) {
  const args = ["gen", "-f", filelist, "--lib", lib, "--level", level];
  if (aux) args.push("--aux", aux);
  let tmp = null;
  if (cfg && cfg.pads && Object.keys(cfg.pads).length) {
    tmp = path.join(os.tmpdir(), `pad-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(cfg));
    args.push("--config", tmp);
  }
  try {
    return await run("pad", args);
  } finally {
    if (tmp) { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
  }
}

module.exports = { run, hdlDump, parseFileMarkers, genconnGenerateAll, genconnInject, ctrlgenGen, padTable, padGen, specgenGen, specgenFragment };
