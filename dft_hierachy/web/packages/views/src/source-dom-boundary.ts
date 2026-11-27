/** A committed code tree, not a second source-coordinate model. */
export function captureSourceDom(code: HTMLElement) {
  const nodes = new Map<Node, { children: Node[]; text: string | null }>();
  function capture(node: Node): void {
    const children = Array.from(node.childNodes);
    nodes.set(node, {
      children,
      text: node.nodeType === 3 ? (node as Text).data : null,
    });
    for (const child of children) capture(child);
  }
  capture(code);

  return (endpoint: Node | null, offset: number): number | undefined => {
    if (
      !code.isConnected ||
      !endpoint ||
      !nodes.has(endpoint) ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    )
      return undefined;
    // Reject foreign/edited DOM rather than interpreting it as model source.
    for (const [node, saved] of nodes) {
      if (
        node.childNodes.length !== saved.children.length ||
        saved.children.some((child, i) => node.childNodes[i] !== child) ||
        (saved.text !== null && (node as Text).data !== saved.text)
      )
        return undefined;
    }
    const saved = nodes.get(endpoint)!;
    if (
      offset >
        (saved.text === null ? saved.children.length : saved.text.length) ||
      (endpoint.nodeType !== 3 && endpoint.nodeType !== 1)
    )
      return undefined;

    let total = 0;
    let found = false;
    function visit(node: Node): void {
      if (found) return;
      const entry = nodes.get(node)!;
      if (node === endpoint) {
        if (entry.text !== null) total += offset;
        else for (const child of entry.children.slice(0, offset)) visit(child);
        found = true;
      } else if (entry.text !== null) total += entry.text.length;
      else for (const child of entry.children) visit(child);
    }
    visit(code);
    return total;
  };
}
