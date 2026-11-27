// Existing production display only. No proposed event handlers or query props.
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { SourceView } from "@hier/views";

const text = "\uFEFF//中😀\t\r\nalpha beta\rnext\n";
const start = text.indexOf("beta");
const complete = { status: "complete", reasons: [] };
// Authored UTF-8 coordinates/hash for this controlled DTO, not an L6 replacement.
const hash = "b6138ffe35cbaad78aa7c66ca65f8f7d2bad35731ff3b4a84922a407c0d48ad9";
const document = {
  source: {
    result: {
      file: "native-file",
      path: "native.sv",
      start: { offset: 21, line: 2, column: 7 },
      end: { offset: 25, line: 2, column: 11 },
      contentHash: hash,
    },
    completeness: complete,
  },
  content: {
    result: { text, contentHash: hash, matchesSnapshot: true },
    completeness: complete,
  },
  location: {
    status: "exact",
    range: {
      start: { offset: start, line: 2, column: 7 },
      end: { offset: start + 4, line: 2, column: 11 },
    },
  },
};
const state = {
  status: "success",
  target: { ref: "native-ref", kind: "definition" },
  data: document,
};
const root = createRoot(window.document.getElementById("mount"));
flushSync(() =>
  root.render(
    <SourceView
      state={state}
      height={240}
      ariaLabel="A native source position capability"
    />,
  ),
);
window.nativeWitness = {
  text,
  start,
  unmount: () => flushSync(() => root.unmount()),
};
