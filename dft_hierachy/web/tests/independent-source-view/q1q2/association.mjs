// A DOM oracle, not a renderer or SourceView surrogate.
export function association(host, code, expected) {
  const check = (v, message) => {
    if (!v) throw Error(message);
  };
  const doc = code.ownerDocument,
    win = doc.defaultView;
  check(host.contains(code), "code belongs to instance");
  let body;
  // Resolve the source scroll responsibility independently of where descriptions are.
  for (let el = code; el && host.contains(el); el = el.parentElement) {
    const s = win.getComputedStyle(el);
    if (
      el.tabIndex === 0 &&
      ["auto", "scroll", "overlay"].includes(s.overflowX) &&
      ["auto", "scroll", "overlay"].includes(s.overflowY)
    ) {
      body = el;
      break;
    }
  }
  check(
    body,
    "source container is focusable and responsible for both scroll axes",
  );
  const ids = (body.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean);
  check(
    ids.length > 0,
    "direct source-body aria-describedby required; ancestors cannot substitute",
  );
  const visibleText = (el) => {
    const walk = doc.createTreeWalker(el, win.NodeFilter.SHOW_TEXT),
      parts = [];
    let node;
    while ((node = walk.nextNode())) {
      let visible = true;
      for (let n = node.parentElement; n; n = n.parentElement) {
        const s = win.getComputedStyle(n);
        if (
          s.display === "none" ||
          s.visibility === "hidden" ||
          s.visibility === "collapse" ||
          n.hidden
        ) {
          visible = false;
          break;
        }
      }
      if (!visible) continue;
      const range = doc.createRange();
      range.selectNodeContents(node);
      if ([...range.getClientRects()].some((r) => r.width > 0 && r.height > 0))
        parts.push(node.data);
    }
    return parts.join("");
  };
  const nodes = [...new Set(ids)].map((id) => {
    const el = doc.getElementById(id);
    check(
      el && host.contains(el),
      "description ID resolves in current instance",
    );
    check(
      [...doc.querySelectorAll("[id]")].filter((n) => n.id === id).length === 1,
      "description ID globally unique",
    );
    check(
      !code.contains(el) && !el.contains(code),
      "description is separate from code",
    );
    return el;
  });
  const text = nodes.map(visibleText).join(" ");
  check(
    text.trim().length > 0,
    "description has visible text, no required wrapper box",
  );
  if (expected.warning)
    check(
      text.includes(expected.warning),
      "current changed warning directly associated",
    );
  else {
    for (const n of expected.numbers)
      check(
        new RegExp("(^|[^0-9])" + n + "([^0-9]|$)").test(text),
        "current L6 coordinates directly associated",
      );
    if (expected.empty)
      check(
        text.includes("空范围"),
        "empty/EOF explanation directly associated",
      );
  }
  return { body, ids: [...new Set(ids)], text };
}
