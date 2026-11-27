# Bound memory JSON planning/check workflow

Apply after `98c261feceb6287115722b52d2ddd332b1ed7dd0` / `integrations/studio-wrapper-config` to the actual non-Git Studio source. This delta fixes exact before/after files without initializing a repository or replacing dependencies/backends.

```sh
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-memory-config --studio /path/to/studio --check
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-memory-config --studio /path/to/studio
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-memory-config --studio /path/to/studio --verify
```

Existing bound `text.json` documents provide explicit memory library models, test configurations and clock expectations. Original native input Schemas (including references) check shape; the original C++ parser owns exact numbers, duplicates, relations and analysis. Three explicit templates use the original exclusive publisher/editor. Ten configured report stages use the same native RunService/history/CLI exit semantics. All selected documents are checked for dirty buffers and review/project digests. Execution reads current disk inputs; it is not atomic config/RTL replay. Current original memory reports have no SourceSpan; the host does not infer coordinates from paths.

CLI, strict Desktop/Tasks and readonly Tcl preview share these services. The existing Wrapper workflow reuses the extracted bounded JSON reader/schema module, retaining its public definitions/errors/results. All preceding 204 definitions and 117 descriptors remain unchanged; eight definitions and three commands are additive. No dependency/Node0.4/Tcl/Core/SDK/native payload or persisted format changes. The preceding `text.json` extension's B75 literal guard difference remains disclosed and its oracle unchanged.

DESIGN7.62, docs/plans/studio-memory-config.md and docs/evidence/a-studio-memory-config-2026-11-09.md record scope/results/limits. This is A implementation/testing, not new B/C acceptance or full S4/MBIST insertion/physical signoff.
