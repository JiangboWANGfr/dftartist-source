// Layering for the TypeScript side (docs/DESIGN.md 3.2, 3.3):
//   protocol-types <- client (L5) <- viewmodel (L6) <- views (L7)
// A layer may import the layer directly below it and protocol-types, nothing else.
const pkg = (name) => `^packages/${name}/`;
const dep = (name) => `(^packages/${name}/|node_modules/@hier/${name}/)`;
const forbid = (from, to) => ({
  name: `${from}-must-not-import-${to}`,
  severity: "error",
  from: { path: pkg(from) },
  to: { path: dep(to) },
});

module.exports = {
  forbidden: [
    forbid("protocol-types", "client"),
    forbid("protocol-types", "viewmodel"),
    forbid("protocol-types", "views"),
    forbid("client", "viewmodel"),
    forbid("client", "views"),
    forbid("viewmodel", "views"),
    forbid("views", "client"),
    {
      name: "browser-must-not-import-node",
      severity: "error",
      from: {
        path: "^packages/",
        pathNot: "^packages/client/(src|dist)/(node/|electron/main\\.ts$|electron/main\\.js$)",
      },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "browser-must-not-import-node-entry",
      severity: "error",
      from: {
        path: "^packages/",
        pathNot: "^packages/client/(src|dist)/(node/|electron/main\\.ts$|electron/main\\.js$)",
      },
      to: { path: "(^packages/client/|node_modules/@hier/client/)(src|dist)/node/" },
    },
    {
      name: "browser-must-not-import-electron",
      severity: "error",
      from: {
        path: "^packages/",
        pathNot: "^packages/client/(src|dist)/electron/(main|preload)\\.(ts|js)$",
      },
      to: { path: "(^electron$|node_modules/electron/)" },
    },
    {
      name: "browser-must-not-import-electron-host",
      severity: "error",
      from: {
        path: "^packages/",
        pathNot: "^packages/client/(src|dist)/electron/main\\.(ts|js)$",
      },
      to: {
        path: "(^packages/client/|node_modules/@hier/client/)(src|dist)/electron/(main|preload)(\\.d)?\\.(ts|js)$",
      },
    },
    {
      name: "only-views-may-import-react",
      severity: "error",
      from: { path: "^packages/(protocol-types|client|viewmodel)/" },
      to: { path: "node_modules/(react|react-dom)/" },
    },
  ],
  options: {
    // Cross-package imports resolve to the target package's dist/. Those edges are what
    // the rules above match, so dist/ must stay visible: it is not followed, never excluded.
    doNotFollow: { path: "node_modules|(^|/)dist/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "types"] },
  },
};
