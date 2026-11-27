// Native DOM controls only. No SourceView, SDK, model or replacement event handler.
import { text } from "./cases.mjs";
window.BSPINative = () => {
  const results = [],
    check = (id, fn) => {
      try {
        fn();
        results.push({ id, pass: true });
      } catch (e) {
        results.push({ id, pass: false, error: String(e) });
      }
    },
    assert = (x, m) => {
      if (!x) throw Error(m);
    };
  const host = document.getElementById("A"),
    pre = document.createElement("pre"),
    code = document.createElement("code"),
    mark = document.createElement("mark");
  code.append(document.createTextNode(text.slice(0, 4)));
  mark.append(document.createTextNode(text.slice(4, 9)));
  code.append(mark, document.createTextNode(text.slice(9)));
  pre.append(code);
  host.append(pre);
  const first = code.firstChild,
    middle = mark.firstChild,
    sel = document.getSelection();
  check("raw-UTF16", () =>
    assert(code.textContent === text && text.length === 18, "literal raw data"),
  );
  check("CRLF-boundary", () => {
    sel.setBaseAndExtent(first, 3, first, 3);
    assert(
      sel.focusNode === first && sel.focusOffset === 3,
      "CRLF interior retained by native Selection",
    );
  });
  check("surrogate-boundary", () => {
    sel.setBaseAndExtent(middle, 2, middle, 2);
    assert(
      sel.focusNode === middle && sel.focusOffset === 2,
      "surrogate interior retained",
    );
  });
  check("reverse-focus", () => {
    sel.setBaseAndExtent(code.lastChild, 5, first, 1);
    assert(
      sel.focusNode === first && sel.focusOffset === 1,
      "activity is focus, not range order",
    );
  });
  check("Element-boundary", () => {
    sel.setBaseAndExtent(mark, mark.childNodes.length, mark, 0);
    assert(
      sel.focusNode === mark && sel.focusOffset === 0,
      "Element offset is child boundary",
    );
  });
  for (const scale of [0.5, 1, 1.5])
    check("native-caret-" + scale, () => {
      host.style.transform = "scale(" + scale + ")";
      const r = document.createRange();
      r.setStart(middle, 3);
      r.setEnd(middle, 4);
      const b = r.getBoundingClientRect(),
        x = b.left + b.width / 3,
        y = b.top + b.height / 2;
      let node, offset;
      if (typeof document.caretPositionFromPoint === "function") {
        const p = document.caretPositionFromPoint(x, y);
        node = p?.offsetNode;
        offset = p?.offset;
      } else if (typeof document.caretRangeFromPoint === "function") {
        const p = document.caretRangeFromPoint(x, y);
        node = p?.startContainer;
        offset = p?.startOffset;
      }
      assert(
        node && code.contains(node) && Number.isInteger(offset),
        "native hit at measured viewport coordinates",
      );
    });
  sel.removeAllRanges();
  pre.remove();
  return results;
};
