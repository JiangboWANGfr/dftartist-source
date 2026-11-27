// B reuses the existing outside-tarball gate, adding only the new public view.
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
    kind: "B62-SearchResultsView-outside-package",
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
    assert.deepEqual(
      packageCases.map((c) => c.id),
      ["SRV-PACK-root", "SRV-PACK-css", "SRV-PACK-peer"],
      "three frozen outside-consumer cases",
    );
    const baseline = spawnSync(process.execPath, [old], {
      env: process.env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 90000,
    });
    // Preserve actual original streams/report from the existing tarball consumer.
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
        if (c.id === "SRV-PACK-root") {
          const probe = spawnSync(
            process.execPath,
            [
              "--input-type=module",
              "-e",
              'import assert from "node:assert/strict";import * as v from "@hier/views";assert.equal(typeof v.SearchResultsView,"function");for(const n of ["SourceView","SourceCandidatesView","HierarchyTree","PropertiesPanel","ObjectConnectionsView"])assert.equal(typeof v[n],"function");',
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
          assert.equal(
            probe.status,
            0,
            "actual installed root SearchResultsView",
          );
          assert.equal(probe.error, undefined);
          const source = consumer + "/b62-search-results-view-consumer.ts";
          fs.writeFileSync(
            source,
            'import type {ReactElement} from "react";import {SearchResultsView} from "@hier/views";import type {SearchResultsViewProps,SearchResultsViewCommand,SearchResultsViewFailure} from "@hier/views";import type {SearchModel,SearchQuery,SearchPage,SelectionModel} from "@hier/viewmodel";declare const search:SearchModel,selection:SelectionModel,page:SearchPage;const q:SearchQuery={snapshotId:"B62-snapshot",text:" raw * ",kinds:["definition","port","definition"]};const p:SearchResultsViewProps={search,selection,height:160,ariaLabel:"B outside",onCommandError(f:SearchResultsViewFailure){const query:SearchQuery=f.query;const raw:unknown=f.error;if(f.command==="select"){const original:SearchPage=f.page;const index:number=f.itemIndex;void [original,index];}else{const absentPage:undefined=f.page;const absentIndex:undefined=f.itemIndex;void [absentPage,absentIndex];}void [query,raw];}};const element:ReactElement=SearchResultsView(p);const commands:readonly SearchResultsViewCommand[]=["loadMore","reload","cancel","select"];const a:SearchResultsViewFailure={command:"loadMore",query:q,error:undefined};const b:SearchResultsViewFailure={command:"select",query:q,page,itemIndex:0,error:null};void [element,commands,a,b];',
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
            "actual installed public SearchResultsView declarations",
          );
        } else if (c.id === "SRV-PACK-css") {
          for (const name of [
            "search-results-view",
            "object-connections-view",
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
