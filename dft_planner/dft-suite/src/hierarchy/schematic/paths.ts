// Hierarchical path helpers shared by the schematic surface and its tests.
//
// TWO forms exist and mixing them up is a real bug we already shipped once:
//   DISPLAY  hierNoTop(...) — harden top stripped, for labels only
//   COMMAND  full*(...)     — harden top INCLUDED, '/'-separated: what we COPY and what we
//                             pass to dp_shell. Verified against the real design:
//                               get_nets processor_core/PROCESSOR_1/clock_module_0/mclk -> hit
//                               get_nets PROCESSOR_1/clock_module_0/mclk                -> nothing

/** dp_shell / SDC spell hierarchy with '/', the schematic model with '.' (and ':' for nets). */
export const userPath = (p: string): string => p.replace(/[.:]/g, "/");

/** Real design path behind a schematic node id.
 *  Ordinary nodes ARE the hierarchical instance path. The clock/reset exact-circuit views also
 *  carry synthetic ids for things the walk produced; map those back to the real object so copy
 *  and add_occ_point always emit something dp_shell can resolve. Returns "" when the node names
 *  no design object (an SDC clock name), so the caller can hide the item.
 *    ff:<kind>:<owner>:<net> -> <owner>.<net>   (the flop group's real clock/reset pin)
 *    g:<inst>:<net>          -> <inst>.<net>    (an RTL gate's output net)
 *    term:<detail>           -> <detail>        (where the walk stopped; may carry a " [reason]")
 *    clk:<name>              -> ""              (an SDC clock name is not a design path)
 *    pi:<path>               -> <path> */
export const realNodePath = (id: string): string => {
  if (id.startsWith("ff:")) {
    const r = id.slice(3);                       // "<kind>:<owner>:<net>"
    const k = r.indexOf(":");
    return k < 0 ? "" : r.slice(k + 1);
  }
  if (id.startsWith("g:")) return id.slice(2);
  if (id.startsWith("thru:")) return id.slice(5);   // pass-through net waypoint -> <inst>:<net>
  if (id.startsWith("port:")) return id.slice(5);   // port source symbol -> <scope>.<net>
  if (id.startsWith("term:")) return id.slice(5).split(" [")[0];
  if (id.startsWith("pi:")) return id.slice(3);
  if (id.startsWith("clk:")) return "";
  if (id.startsWith("logic:")) {
    // logic:[<scope>:]<file>:<line> — the scope segment (no '/', unlike a file path) IS the
    // owning instance, so copy/Show-All-Pins on a behavioural block resolve to something real.
    const rest = id.slice(6);
    const c0 = rest.indexOf(":");
    if (c0 > 0) {
      const head = rest.slice(0, c0);
      if (!head.includes("/") && !head.includes("\\")) return head;
    }
    return "";   // old-format id: no instance information to offer
  }
  return id;
};

/** Deepest scope containing both ids = their common hierarchical prefix. */
export const commonScope = (a: string, b: string): string => {
  const A = a.split("."), B = b.split(".");
  const out: string[] = [];
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    if (A[i] !== B[i]) break;
    out.push(A[i]);
  }
  return out.join(".");
};

/** FULL hierarchical path of a PIN (top included), in dp_shell '/' form.
 *  An RTL gate node (`g:`) stands for an `assign` statement, which has NO physical pins — its
 *  only real object is the net it drives, so we return that rather than inventing `<net>/y`. */
export const fullPin = (nodeId: string, port: string): string => {
  const base = realNodePath(nodeId);
  if (!base) return port;
  // Source symbols stand for ONE design object and their pins are synthetic ("o"/"i"/"y"):
  // a gate for the net its assign drives, a port/thru symbol for the port/net itself —
  // appending the fake pin produced ".../cpu_en/o", which nothing resolves.
  if (nodeId.startsWith("g:") || nodeId.startsWith("port:") || nodeId.startsWith("thru:") ||
      nodeId.startsWith("pi:"))
    return userPath(base);
  // a synthetic pin id already ends in the net/pin name — don't append it twice
  return userPath(base.endsWith("." + port) || base.endsWith(":" + port) ? base : `${base}.${port}`);
};

/** FULL hierarchical path of a NET: its declaring scope (top included) + the net name. */
export const fullNetPath = (fromNode: string, toNode: string, net: string): string => {
  const scope = commonScope(realNodePath(fromNode), realNodePath(toNode));
  return scope ? `${scope}.${net}` : net;
};
