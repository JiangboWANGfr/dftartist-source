import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { cases } from "./cases.mjs";
import { heapGraph, reactions, delta } from "./heap.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex");
if (process.argv.includes("--list")) {
  console.log(
    JSON.stringify({ kind: "B46-facility-only-not-Q1-oracle", cases }, null, 2),
  );
} else {
  const tools = process.env.HIER_B_BROWSER_TOOLS,
    parent = process.env.HIER_B_Q1_EVIDENCE_ROOT;
  assert(
    tools && parent && path.isAbsolute(tools) && path.isAbsolute(parent),
    "explicit readonly tool / owned evidence roots",
  );
  const tool = createRequire(path.join(fs.realpathSync(tools), "package.json")),
    { chromium } = tool("playwright"),
    E = fs.mkdtempSync(path.join(fs.realpathSync(parent), "native-Promise-"));
  const result = {
    kind: "B46-pending-native-Promise-heap-feasibility",
    evidence: E,
    cases: [],
    cdp: [],
    snapshots: [],
    pageErrors: [],
    cleanupErrors: [],
    candidateUIExecuted: 0,
    SDKExecuted: 0,
    CoreExecuted: 0,
    ElectronExecuted: 0,
    Q1Closed: false,
    approvedObserver: false,
    formalUIOracle: false,
  };
  let browser,
    page,
    cdp,
    paused = false,
    execution;
  function deadline(p, label) {
    let timer;
    return Promise.race([
      p,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("facility watchdog " + label)),
          20000,
        );
      }),
    ]).finally(() => clearTimeout(timer));
  }
  async function send(method, params = {}) {
    const start = performance.now();
    try {
      const value = await deadline(cdp.send(method, params), method);
      result.cdp.push({
        method,
        params,
        seconds: (performance.now() - start) / 1000,
        result: value,
      });
      return value;
    } catch (error) {
      result.cdp.push({
        method,
        params,
        seconds: (performance.now() - start) / 1000,
        error: String(error.stack ?? error),
      });
      throw error;
    }
  }
  async function snap(name) {
    let raw = "";
    const add = ({ chunk }) => {
      raw += chunk;
    };
    cdp.on("HeapProfiler.addHeapSnapshotChunk", add);
    try {
      await send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
      const bytes = Buffer.from(raw),
        file = path.join(E, name + ".heapsnapshot");
      fs.writeFileSync(file, bytes);
      result.snapshots.push({
        name,
        file,
        bytes: bytes.length,
        sha256: sha(bytes),
      });
      return heapGraph(JSON.parse(raw));
    } finally {
      cdp.off("HeapProfiler.addHeapSnapshotChunk", add);
    }
  }
  async function expression(source) {
    const r = await send("Runtime.evaluate", {
      expression: source,
      awaitPromise: false,
      returnByValue: true,
    });
    assert(!r.exceptionDetails, "facility expression did not throw");
    return r.result.value;
  }
  try {
    browser = await chromium.launch({ headless: true });
    result.chromium = browser.version();
    result.playwright = tool("playwright/package.json").version;
    result.node = process.versions;
    result.platform = process.platform;
    result.arch = process.arch;
    page = await browser.newPage();
    page.on("pageerror", (error) =>
      result.pageErrors.push(String(error.stack ?? error)),
    );
    cdp = await page.context().newCDPSession(page);
    await send("HeapProfiler.enable");
    await send("Debugger.enable");
    result.browserInfo = await send("Browser.getVersion");
    assert.equal(
      result.chromium,
      "156.0.8078.4",
      "diagnostic pins private-layout engine version",
    );
    assert.equal(result.playwright, "1.64.1", "existing locked browser tool");
    assert.equal(
      result.browserInfo.jsVersion,
      "15.6.75",
      "diagnostic pins V8 version",
    );
    assert.equal(
      result.browserInfo.revision,
      "@f842f52ef39fd97b449eb27cff414bf05a98ddce",
      "diagnostic pins Chromium revision",
    );
    await expression(`(()=>{
   const modes=${JSON.stringify(cases.map((c) => c.id))},nativePromise=Promise,nativeThen=Promise.prototype.then,nativeConstructor=Promise.prototype.constructor,states={};
   const e={};globalThis.__B46={states,events:[],sentinel:e,run(){
    for(const [mode,c]of Object.entries(states)){
     if(mode==="direct-dual"||mode==="fulfilled-direct"||mode==="rejected-direct")c.child=c.p.then(function directOK(){},function directBad(){});
     if(mode==="native-await")c.child=(async function nativeAwait(){try{await c.p;}catch(error){if(error!==e)throw Error("native await raw error lost");__B46.events.push("await-original-error");}})();
     if(mode==="empty-forward"){c.forward=c.p.then();c.child=c.forward.then(function derivedOK(){},function derivedBad(){});}
     if(mode==="success-only"||mode==="two-success"||mode==="split-handlers"){c.child=c.p.then(function successOnly(){});c.childCleanup=c.child.catch(function ownedDerivedCleanup(){});}
     if(mode==="reject-only")c.child=c.p.catch(function rejectOnly(){});
     if(mode==="two-success"){c.child2=c.p.then(function anotherSuccessOnly(){});c.child2Cleanup=c.child2.catch(function ownedDerivedCleanup(){});}
     if(mode==="split-handlers")c.child2=c.p.catch(function splitReject(){});
     if(mode==="microtask-late")queueMicrotask(()=>{__B46.events.push("late-installed");c.child=c.p.then(function lateOK(){},function lateBad(){});});
     if(mode==="sync-invalidated"){c.active=false;if(c.active)c.child=c.p.then(()=>{},()=>{});}
     if(mode==="feedback-suppressed")c.feedbackSuppressed=true;
    }
    debugger;
   },integrity(){
    return Promise===nativePromise&&Promise.prototype.then===nativeThen&&Promise.prototype.constructor===nativeConstructor&&Object.values(states).every(c=>c.p===c.original&&Object.getPrototypeOf(c.p)===Promise.prototype&&Reflect.ownKeys(c.p).length===0&&c.p.then===nativeThen&&c.p.constructor===nativeConstructor);
   },settle(){
    for(const c of Object.values(states))if(c.reject)c.reject(e);
    return Promise.allSettled(Object.values(states).flatMap(c=>[c.internal,c.child,c.forward,c.child2,c.childCleanup,c.child2Cleanup].filter(Boolean)));
   }};
   for(const mode of modes){
    const c={};
    if(mode==="fulfilled-direct")c.p=Promise.resolve(17);
    else if(mode==="rejected-direct")c.p=Promise.reject(e);
    else c.p=new Promise((resolve,reject)=>{c.resolve=resolve;c.reject=reject;});
    c.original=c.p;
    c.internal=mode==="internal-dual-only"?c.p.then(function internalOK(){},function internalBad(){}):c.p.catch(function internalReject(){});
    states[mode]=c;
   }
  })()`);
    assert.equal(await expression("__B46.integrity()"), true);
    const before = await snap("before"),
      refs = {};
    for (const c of cases) {
      const remote = await send("Runtime.evaluate", {
        expression: "__B46.states[" + JSON.stringify(c.id) + "].p",
        awaitPromise: false,
        objectGroup: "B46-original-Promise",
      });
      assert(
        remote.result.objectId && !remote.exceptionDetails,
        "actual Promise remote id",
      );
      const id = (
        await send("HeapProfiler.getHeapObjectId", {
          objectId: remote.result.objectId,
        })
      ).heapSnapshotObjectId;
      assert(id !== "0", "actual tracked heap id");
      const p = await send("Runtime.getProperties", {
        objectId: remote.result.objectId,
        ownProperties: true,
      });
      const state = p.internalProperties.find(
        (v) => v.name === "[[PromiseState]]",
      )?.value?.value;
      assert(
        ["pending", "fulfilled", "rejected"].includes(state),
        "actual inspector Promise state",
      );
      refs[c.id] = { id, state };
    }
    result.refs = refs;
    let onPause;
    const stopped = new Promise((resolve) => {
      onPause = (event) => {
        paused = true;
        resolve(event);
      };
      cdp.once("Debugger.paused", onPause);
    });
    execution = send("Runtime.evaluate", {
      expression: "__B46.run()",
      awaitPromise: false,
      returnByValue: true,
    });
    execution.catch(() => {});
    const stop = await deadline(stopped, "same-stack pause");
    result.pause = { reason: stop.reason, callFrames: stop.callFrames };
    const marker = async () => {
      const r = await send("Debugger.evaluateOnCallFrame", {
        callFrameId: stop.callFrames[0].callFrameId,
        expression:
          "({events:__B46.events.slice(),integrity:__B46.integrity()})",
        returnByValue: true,
      });
      assert(!r.exceptionDetails);
      assert.deepEqual(
        r.result.value,
        { events: [], integrity: true },
        "no microtask/Promise mutation before cutoff",
      );
      return r.result.value;
    };
    result.markers = [await marker()];
    const immediate = await snap("immediate-A");
    result.markers.push(await marker());
    const duplicate = await snap("immediate-B-repeat");
    result.markers.push(await marker());
    for (const c of cases) {
      const { id, state } = refs[c.id],
        b = reactions(before, id, state),
        a = reactions(immediate, id, state),
        again = reactions(duplicate, id, state);
      assert.deepEqual(
        a,
        again,
        "paused repeated snapshot did not change original reaction graph",
      );
      const row = {
        id: c.id,
        input: c.input,
        expected: c.expected,
        before: b,
        immediate: a,
        repeated: again,
      };
      if (state === "pending") {
        row.delta = delta(b, a);
        const { rows, ...shape } = row.delta;
        assert.deepEqual(
          { status: "pending-structure-only", ...shape },
          c.expected,
          "known consumer structure " + c.id,
        );
      } else {
        assert.equal(c.expected.status, "unsupported-settled");
        row.unsupported =
          "settled original cannot be attributed from pending reaction list";
      }
      result.cases.push(row);
    }
    await send("Debugger.resume");
    paused = false;
    await execution;
    const later = await snap("later");
    result.laterMarker = await expression(
      "({events:__B46.events.slice(),integrity:__B46.integrity()})",
    );
    assert.equal(result.laterMarker.integrity, true);
    assert.deepEqual(result.laterMarker.events, ["late-installed"]);
    for (const row of result.cases) {
      const { id, state } = refs[row.id];
      row.later = reactions(later, id, state);
      if (state === "pending") {
        row.laterDelta = delta(row.before, row.later);
        if (row.id === "microtask-late")
          assert.equal(
            row.laterDelta.dual,
            1,
            "late observable only after original stack",
          );
        else
          assert.deepEqual(
            row.later,
            row.immediate,
            "other controls unchanged after resume",
          );
      }
    }
    await send("HeapProfiler.collectGarbage");
    const afterGC = await snap("later-after-explicit-GC");
    for (const row of result.cases) {
      const { id, state } = refs[row.id];
      row.afterUnpausedGC = reactions(afterGC, id, state);
      assert.deepEqual(
        row.afterUnpausedGC,
        row.later,
        "unpaused explicit GC preserves known original structures",
      );
    }
    const two = result.cases.find((c) => c.id === "two-success").delta,
      split = result.cases.find((c) => c.id === "split-handlers").delta;
    const shape = ({ rows, ...v }) => v;
    assert.deepEqual(
      shape(two),
      shape(split),
      "explicit insufficient role-discrimination counterexample",
    );
    const settlement = await send("Runtime.evaluate", {
      expression:
        "__B46.settle().then(()=>({events:__B46.events.slice(),integrity:__B46.integrity()}))",
      awaitPromise: true,
      returnByValue: true,
    });
    assert(!settlement.exceptionDetails);
    assert.equal(settlement.result.value.integrity, true);
    assert(settlement.result.value.events.includes("await-original-error"));
    result.settlement = settlement.result.value;
    result.summary = {
      knownControls: 14,
      pendingStructures: 12,
      unsupportedSettled: 2,
      lateBeforeCutoff: false,
      repeatSnapshotStable: true,
      unpausedGCStable: true,
      pausedExplicitGCCompleted: false,
      splitRoleDiscriminator: false,
      originalPromiseMutated: false,
      pendingCandidateOnly: true,
    };
    result.exitCode = 0;
  } catch (error) {
    result.exitCode = 1;
    result.error = String(error.stack ?? error);
  } finally {
    for (const [name, fn] of [
      [
        "resume",
        async () => {
          if (paused && cdp) {
            await cdp.send("Debugger.resume");
            paused = false;
          }
        },
      ],
      [
        "release-remote-handles",
        async () => {
          if (cdp)
            await cdp.send("Runtime.releaseObjectGroup", {
              objectGroup: "B46-original-Promise",
            });
        },
      ],
      ["cdp", () => cdp?.detach()],
      ["page", () => page?.close()],
      ["browser", () => browser?.close()],
    ])
      try {
        await deadline(Promise.resolve().then(fn), "cleanup " + name);
      } catch (error) {
        result.cleanupErrors.push({
          name,
          error: String(error.stack ?? error),
        });
      }
    if (result.cleanupErrors.length || result.pageErrors.length)
      result.exitCode = 1;
  }
  fs.writeFileSync(
    path.join(E, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.exitCode;
}
