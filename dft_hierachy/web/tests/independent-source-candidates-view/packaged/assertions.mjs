import assert from "node:assert/strict";
import path from "node:path";
export function inside(file, root) {
  assert(
    file.startsWith(root + path.sep),
    "real input must be inside consumer, not prefix collision/source fallback",
  );
}
export function typeInput(file, consumer, compilerLib, defaultLibrary) {
  if (file.startsWith(consumer + path.sep)) return "consumer";
  assert(
    defaultLibrary === true &&
      path.dirname(file) === compilerLib &&
      /^lib(?:\.[a-z0-9]+)*\.d\.ts$/.test(path.basename(file)),
    "outside input must be a genuine default TypeScript standard library",
  );
  return "standard-library";
}
export function cssSyntax(parsed) {
  assert(
    !parsed.warnings.some((warning) => warning.id === "css-syntax-error"),
    "pinned CSS parser must not report syntax-error warnings",
  );
}
export function compilePositive(result) {
  assert.deepEqual(
    result.diagnostics,
    [],
    "actual public positive types must compile",
  );
}
export function compileNegative(result, file, code) {
  assert.equal(
    result.diagnostics.length,
    1,
    "exactly one isolated semantic diagnostic",
  );
  const d = result.diagnostics[0];
  assert.equal(
    d.file,
    file,
    "diagnostic must be in the intended consumer input",
  );
  assert.equal(
    d.code,
    code,
    "the intended semantic diagnostic, not missing export/module",
  );
}
export function peer(manifest, semver) {
  const range = manifest.peerDependencies?.react;
  assert.equal(typeof range, "string", "React is a declared peer");
  assert(semver.validRange(range), "valid React peer range");
  assert(
    semver.subset(range, ">=18.3.1 <19") &&
      semver.subset(">=18.3.1 <19", range),
    "semantic React18 peer range",
  );
  for (const k of ["dependencies", "optionalDependencies"])
    assert(!manifest[k]?.react, "not a private React runtime");
  for (const k of ["bundledDependencies", "bundleDependencies"]) {
    const value = manifest[k];
    assert(
      value !== true && !(Array.isArray(value) && value.includes("react")),
      "not bundled React",
    );
  }
}
