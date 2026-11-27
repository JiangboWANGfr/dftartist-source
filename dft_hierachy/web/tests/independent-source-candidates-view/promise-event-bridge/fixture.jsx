import React, { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { HierClient } from "@hier/client";
import { SourceNavigationModel, SelectionModel } from "@hier/viewmodel";
import { ready } from "../pointer-rebind/public-model.mjs";
import { complete, cursor } from "../pagination/public-model.mjs";
import { observeReturn } from "./tap.mjs";
import { wireCursor } from "./cases.mjs";
const check = (x, m) => {
  if (!x) throw Error("B48 facility: " + m);
};
globalThis.__B48 = {
  phase: "boot",
  events: [],
  errors: [],
  unhandled: [],
  cleanupErrors: [],
};
const f = globalThis.__B48,
  nativePromise = Promise,
  nativeThen = Promise.prototype.then,
  nativeConstructor = Promise.prototype.constructor;
const onError = (e) => f.errors.push(String(e.error?.stack ?? e.message)),
  onUnhandled = (e) => f.unhandled.push(String(e.reason));
window.addEventListener("error", onError);
window.addEventListener("unhandledrejection", onUnhandled);
f.setup = async (config) => {
  f.config = config;
  f.c = await ready({ HierClient, SourceNavigationModel, SelectionModel });
  const c = f.c,
    ancestor = document.getElementById("ancestor"),
    host = document.getElementById("root");
  f.initial = { document: c.document, selection: c.s.current };
  f.sentBefore = c.sent.length;
  f.commands = 0;
  f.mounted = false;
  f.lateInstalled = false;
  f.notified = false;
  f.branches = [];
  f.root = createRoot(host);
  const cleanupUnmount = () => {
    f.events.push("layout-cleanup");
    f.mounted = false;
  };
  function KnownConsumer() {
    useLayoutEffect(() => {
      f.mounted = true;
      f.events.push("layout-mounted");
      return cleanupUnmount;
    }, []);
    return (
      <button
        onClick={(event) => {
          check(!f.nativeEvent, "one event only");
          f.nativeEvent = event.nativeEvent;
          f.events.push("event-start");
          const p = c.n[config.command]();
          f.received = p;
          f.events.push("consumer-received");
          check(
            p === f.original,
            "caller receives unchanged original Promise after checkpoint",
          );
          if (config.mode === "unmount-skip" && !f.mounted) {
            f.events.push("skip-after-unmount");
            return;
          }
          const ok = () => {
              f.events.push("consumer-success");
            },
            bad = (error) => {
              f.rawError = error;
              f.events.push("consumer-rejection");
            };
          if (config.mode === "native-await")
            f.branches.push(
              (async () => {
                try {
                  await p;
                  ok();
                } catch (e) {
                  bad(e);
                }
              })(),
            );
          else if (config.mode === "empty-forward") {
            const forwarded = p.then();
            f.branches.push(forwarded, forwarded.then(ok, bad));
          } else if (config.mode === "microtask-late")
            queueMicrotask(() => {
              f.lateInstalled = true;
              f.events.push("late-installed");
              f.branches.push(p.then(ok, bad));
            });
          else if (config.mode === "success-only") f.branches.push(p.then(ok));
          else f.branches.push(p.then(ok, bad));
          f.events.push("consumer-call-ended");
        }}
      >
        B48 known consumer, not candidate view
      </button>
    );
  }
  flushSync(() => f.root.render(<KnownConsumer />));
  f.off = c.n.subscribe(() => {
    if (c.n.state.candidates?.state.status !== "pending") return;
    f.notified = true;
    f.events.push("real-pending-notification");
    if (config.mode.startsWith("unmount-")) {
      flushSync(() => f.root.unmount());
      f.events.push("sync-unmounted");
      check(
        host.childNodes.length === 0 && !f.mounted,
        "real synchronous unmount before command returns",
      );
    }
  });
  f.tap = observeReturn(c.n, config.command, (r) => {
    f.commands++;
    f.record = r;
    f.original = r.value;
    f.events.push("baseline-before-return");
    f.phase = "baseline";
    debugger;
  });
  f.tail = (event) => {
    if (event !== f.nativeEvent) return;
    f.events.push("ancestor-event-tail");
    f.tailEvent = event;
    f.phase = "cutoff";
    debugger;
  };
  // Stable ancestor is outside React's root and survives flushSync root.unmount.
  ancestor.addEventListener("click", f.tail);
  f.fire = () => {
    host.querySelector("button").click();
    f.phase = "event-returned";
  };
  f.marker = () => ({
    phase: f.phase,
    events: f.events.slice(),
    lateInstalled: f.lateInstalled,
    commands: f.commands,
    receiver: f.record?.receiver === c.n,
    args: f.record?.args.length,
    received: f.received === f.original,
    sameEvent: f.tailEvent === f.nativeEvent,
    pending: c.n.state.candidates.state.status === "pending",
    notified: f.notified,
    mounted: f.mounted,
    domChildren: host.childNodes.length,
    sent: c.sent.length - f.sentBefore,
    document: c.n.state.document.data === f.initial.document,
    selection: c.s.current === f.initial.selection,
    integrity:
      Promise === nativePromise &&
      Promise.prototype.then === nativeThen &&
      Promise.prototype.constructor === nativeConstructor &&
      Object.getPrototypeOf(f.original) === nativePromise.prototype &&
      Reflect.ownKeys(f.original).length === 0,
  });
  f.finish = async () => {
    const q = await c.next("source.resolve");
    check(q, "held real SDK request");
    check(
      q.params.cursor === wireCursor(config.command, cursor),
      "public command cursor versus fresh reload",
    );
    c.ok(q, { items: [] }, complete);
    // Only AFTER all observations: fixture, not observer, awaits owned outputs.
    await Promise.allSettled([f.original, ...f.branches]);
    check(
      c.n.state.document.data === f.initial.document &&
        c.s.current === f.initial.selection,
      "completion keeps original doc and Selection",
    );
    return {
      marker: f.marker(),
      successfulConsumer: f.events.includes("consumer-success"),
      candidateUI: false,
    };
  };
  f.close = async () => {
    const errors = [];
    const attempt = (label, fn) => {
      try {
        fn();
      } catch (error) {
        errors.push({ label, error });
      }
    };
    attempt("ancestor-listener", () =>
      ancestor.removeEventListener("click", f.tail),
    );
    attempt("react-root", () => {
      if (f.mounted) flushSync(() => f.root.unmount());
    });
    attempt("navigation-subscription", () => f.off());
    attempt("public-method", () => f.tap.restore());
    try {
      errors.push(...(await c.close()));
    } catch (error) {
      errors.push({ label: "models", error });
    }
    f.cleanupErrors = errors.map((e) => ({
      label: e.label,
      error: String(e.error?.stack ?? e.error),
    }));
    // Two explicit task checkpoints, not time-based product waiting.
    await new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(0);
    });
    await new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(0);
    });
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandled);
    return {
      errors: f.errors,
      unhandled: f.unhandled,
      cleanupErrors: f.cleanupErrors,
      wireMessages: c.messages.size,
      wireCloses: c.closes.size,
      rootEmpty: host.childNodes.length === 0,
      methodRestored: !Object.hasOwn(c.n, config.command),
    };
  };
  f.phase = "ready";
  return { candidateUI: false, ready: true };
};
