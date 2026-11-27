// Reuse the unchanged B outside-consumer tarball gate; add only the new public panel surface.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { packageCases } from "./cases.mjs";
if (process.argv.includes("--list"))
  console.log(
    JSON.stringify(
      { planned: packageCases.length, cases: packageCases },
      null,
      2,
    ),
  );
else {
  const old = fileURLToPath(
    new URL(
      "../independent-source-candidates-view/packaged/run.mjs",
      import.meta.url,
    ),
  );
  const r = {
    kind: "B54-PropertiesPanel-outside-package",
    planned: 3,
    executed: 0,
    passed: 0,
    failed: 0,
    blocked: 3,
    skipped: 0,
    results: [],
    setupError: null,
    exitCode: 1,
  };
  try {
    const baseline = spawnSync(process.execPath, [old], {
      env: process.env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 90000,
    });
    // Preserve the old original report/streams, not an invented substitute consumer.
    process.stdout.write(baseline.stdout ?? "");
    process.stderr.write(baseline.stderr ?? "");
    assert.equal(baseline.error, undefined);
    assert.equal(baseline.signal, null);
    assert.equal(baseline.status, 0, "original outside tarball gate premise");
    const original = JSON.parse(baseline.stdout);
    assert.equal(original.report.passed, 4);
    assert.equal(original.setupError, null);
    assert.deepEqual(original.cleanupErrors, []);
    const consumer = original.report.consumer;
    assert(path.isAbsolute(consumer));
    r.consumer = consumer;
    r.product = original.product;
    r.fixed = original.fixed;
    const req = createRequire(consumer + "/package.json"),
      views = req.resolve("@hier/views"),
      manifest = JSON.parse(
        fs.readFileSync(path.resolve(path.dirname(views), "../package.json")),
      );
    const requireTools = createRequire(
      process.env.HIER_B_BROWSER_TOOLS + "/package.json",
    );
    for (const c of packageCases) {
      let error = null;
      try {
        if (c.id === "P-PACK-root") {
          const probe = spawnSync(
            process.execPath,
            [
              "--input-type=module",
              "-e",
              'import assert from "node:assert/strict";import * as v from "@hier/views";assert.equal(typeof v.PropertiesPanel,"function");for(const n of ["SourceView","SourceCandidatesView","HierarchyTree"])assert.equal(typeof v[n],"function");',
            ],
            {
              cwd: consumer,
              env: { ...process.env, NODE_PATH: "" },
              encoding: "utf8",
              timeout: 15000,
            },
          );
          r.rootProbe = {
            status: probe.status,
            signal: probe.signal,
            error: probe.error ? String(probe.error) : null,
            stdout: probe.stdout,
            stderr: probe.stderr,
          };
          assert.equal(probe.status, 0, "actual installed root panel export");
          assert.equal(probe.error, undefined);
          const source = consumer + "/b54-panel-consumer.ts";
          fs.writeFileSync(
            source,
            'import {PropertiesPanel} from "@hier/views";import type {PropertiesPanelProps,PropertiesPanelCommand,PropertiesPanelCommandFailure} from "@hier/views";import type {InstancePropertiesModel,SelectionModel} from "@hier/viewmodel";declare const properties:InstancePropertiesModel,selection:SelectionModel;const p:PropertiesPanelProps={properties,selection,height:160,ariaLabel:"B outside",onCommandError(f:PropertiesPanelCommandFailure){const e:unknown=f.error;if(f.command==="select"){const ref:string=f.ref;void ref;}void e;}};PropertiesPanel(p);const c:PropertiesPanelCommand="reload";void c;',
          );
          const ts = requireTools("typescript"),
            options = {
              target: ts.ScriptTarget.ES2022,
              module: ts.ModuleKind.NodeNext,
              moduleResolution: ts.ModuleResolutionKind.NodeNext,
              strict: true,
              exactOptionalPropertyTypes: true,
              noEmit: true,
              skipLibCheck: false,
              types: [],
            };
          const diagnostics = ts.getPreEmitDiagnostics(
            ts.createProgram([source], options),
          );
          r.outsideTypeDiagnostics = diagnostics.map((d) => ({
            code: d.code,
            message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
          }));
          assert.equal(
            diagnostics.length,
            0,
            "actual installed public panel declarations",
          );
        } else if (c.id === "P-PACK-css") {
          for (const name of [
            "properties-panel",
            "source-view",
            "source-candidates-view",
            "hierarchy-tree",
          ]) {
            const f = req.resolve("@hier/views/" + name + ".css");
            assert(
              f.startsWith(consumer + path.sep),
              "inside outside consumer",
            );
            const b = fs.readFileSync(f);
            assert(b.length > 0);
            const out = await requireTools("esbuild").build({
              entryPoints: [f],
              bundle: false,
              write: false,
            });
            assert.deepEqual(out.warnings, []);
          }
        } else {
          assert.equal(original.report.peerTree.status, 0);
          assert.equal(manifest.peerDependencies.react, ">=18.3.1 <19");
          assert.deepEqual(
            Object.keys(manifest.dependencies).sort(),
            [
              "@hier/viewmodel",
              "@hier/protocol-types",
              "@tanstack/virtual-core",
            ].sort(),
            "no new production runtime dependencies",
          );
          assert(!manifest.dependencies["react-dom"], "ReactDOM host only");
        }
      } catch (e) {
        error = String(e.stack ?? e);
      }
      r.executed++;
      r.blocked--;
      if (error) r.failed++;
      else r.passed++;
      r.results.push({ id: c.id, pass: !error, error });
    }
    r.exitCode = r.failed ? 1 : 0;
  } catch (e) {
    r.setupError = String(e.stack ?? e);
  }
  console.log(JSON.stringify(r, null, 2));
  process.exitCode = r.exitCode;
}
