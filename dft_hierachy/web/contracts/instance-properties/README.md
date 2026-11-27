# M5-A-03a instance properties contract

Normative proposal: DESIGN §6.9. No production model export exists yet.
The model borrows a ready SDK and publishes one instance's information, ports and parameters together.
Core remains the owner of widths, types and elaborated parameter values. Selection coordination,
other object properties, connection queries and PropertiesPanel need their subsequent contracts.

Run from the repository root with Node 24 and the existing web toolchain:

```sh
npm --prefix web run typecheck
node web/node_modules/typescript/bin/tsc -p web/contracts/tsconfig.instance-properties.json
node web/contracts/instance-properties/verify-types.mjs
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/instance-properties/sdk-core-witness.test.mjs
```

The type verifier compiles the actual declaration and consumer, then removes each negative marker
individually and requires a diagnostic at its guarded source line. It does not execute a replacement model.
The SDK witness uses the actual owned Core with a parameterized SystemVerilog fixture and the existing
public SDK only. It proves the available query chain, not the proposed model's scheduling or lifecycle.
The proposal awaits C review and independent B inputs; neither check counts as runtime acceptance.

No new dependencies, public production exports, IPC, Schema or project file changes.
