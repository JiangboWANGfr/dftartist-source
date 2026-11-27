# Electron contract declarations (not production)

Normative behavior: [DESIGN §6.8](../../../docs/DESIGN.md).
These files propose separate `@hier/client/electron/main`, `/preload`, and `/renderer`
entries. They do not add package exports or an IPC implementation.

From the repository root (supported Node, existing web dependencies):

```sh
npm --prefix web/contracts/electron ci --offline --ignore-scripts --no-audit --no-fund --workspaces=false
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/tsconfig.electron.json
```

Electron 42.3.3 is an isolated, locked **type-checking** dependency, MIT. Installation
scripts are disabled; no Electron binary is installed or executed. This does not
select the final product runtime, prove IPC behavior, or certify a version range.
No declarations are copied from the old product; its third-party version was only
used to choose a concrete type baseline. Main uses the real Electron WebContents
and the existing ProcessTransportOptions. Renderer signatures import no Electron
or Node types. The consumers are compile-only; they do not mount views or launch Core.
