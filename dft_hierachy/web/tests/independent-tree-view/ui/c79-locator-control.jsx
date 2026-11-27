// B locator contrast only. Real SDK/L6 from unchanged fixtures; never a fake HierarchyTree.
let c79ReactRoot;
const c79Jobs = [];
window.C79 = {
  async setup(shape) {
    window.C79.unmount();
    await window.UI.setup();
    await window.UI.seed();
    window.UI.external([{ ref: "B-child-a" }]);
    const row = window.UI.state().rows.find((r) => r.kind === "instance");
    function LocatorControl() {
      const [expanded, setExpanded] = useState(row.expanded);
      const expand = (event) => {
        event.stopPropagation();
        const job = window.UI.command("setExpanded", row.id, true).then(() => {
          setExpanded(
            window.UI.state().rows.find((r) => r.id === row.id).expanded,
          );
        });
        job.catch(() => {}); // This B control owns the waiter; settle below still surfaces failure.
        c79Jobs.push(job);
      };
      const select = () => window.UI.external([{ ref: row.ref }], "tree");
      const trigger =
        shape === "span" ? (
          <span data-c79-toggle onClick={expand}>
            Toggle children
          </span>
        ) : (
          <button data-c79-toggle tabIndex={-1} onClick={expand}>
            Toggle children
          </button>
        );
      return (
        <>
          <div role="tree" aria-label="B locator contrast">
            <div
              role="treeitem"
              data-c79-row
              aria-expanded={expanded}
              style={{ height: 28, width: 480, border: "1px solid black" }}
              onClick={(event) =>
                shape === "row-region" && event.nativeEvent.offsetX < 24
                  ? expand(event)
                  : select()
              }
            >
              {shape === "row-region" ? (
                <span style={{ marginLeft: 32 }}>Model row</span>
              ) : (
                trigger
              )}
              {shape === "two-buttons" && (
                <button tabIndex={-1}>Unrelated info</button>
              )}
            </div>
          </div>
          <button data-c79-outside>Outside control</button>
        </>
      );
    }
    c79ReactRoot = createRoot(document.getElementById("c79-root"));
    flushSync(() => c79ReactRoot.render(<LocatorControl />));
    await window.UI.settle();
    return {
      rowId: row.id,
      state: window.UI.state(),
      productionComponentMounted: false,
    };
  },
  async settle() {
    await Promise.all(c79Jobs.splice(0));
    await window.UI.settle();
    return window.UI.state();
  },
  unmount() {
    if (c79ReactRoot) {
      flushSync(() => c79ReactRoot.unmount());
      c79ReactRoot = undefined;
    }
  },
};
