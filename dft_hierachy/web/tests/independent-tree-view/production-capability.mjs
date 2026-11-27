// Agent B. Only a capability gate; a missing export is not 100 UI semantic failures.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
const productRoot = path.resolve(
  process.env.HIER_B_PRODUCT_ROOT ?? path.join(import.meta.dirname, "../../.."),
);
const target = path.join(productRoot, "web/packages/views/dist/index.js");
const module = await import(pathToFileURL(target).href);
console.log(
  JSON.stringify(
    {
      productRoot,
      target,
      exports: Object.keys(module),
      hierarchyTree: typeof module.HierarchyTree,
      note: "no React/browser semantic cases are executed by this capability gate",
    },
    null,
    2,
  ),
);
assert.equal(
  typeof module.HierarchyTree,
  "function",
  "production HierarchyTree is not delivered",
);
