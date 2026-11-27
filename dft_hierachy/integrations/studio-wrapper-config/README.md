# Bound Wrapper JSON configuration workflow

Apply after `2601dd0612557fcfab93ee938fe3bf90ebaab000` / `integrations/studio-native-comparison`.
Actual non-Git Studio files are updated; this directory fixes exact before/after sources for review and replay. Dependencies/native binaries remain unchanged.

```sh
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-wrapper-config --studio /path/to/studio --check
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-wrapper-config --studio /path/to/studio
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-wrapper-config --studio /path/to/studio --verify
```

The shared raw text model adds `text.json` (including recovery drafts). Four previous `documentType` enums append that value; other old definitions and command descriptors remain unchanged. Wrapper preview uses the original pinned input Schema for shape only; the native parser owns full validation. Template creation uses the existing exclusive publisher. The new RunService method checks its own workspace/dirty/saved preview and calls the existing native task service, reading current disk inputs rather than archiving configurations/RTL. CLI, strict IPC, Tasks and readonly Tcl preview are included. All ten configured output modes use existing native code/Schema.

DESIGN7.61, docs/plans/studio-wrapper-config.md and docs/evidence/a-studio-wrapper-config-2026-11-09.md record results and limits. B75/C30 accepted only the preceding fixed workflow; this delta is A implementation/testing. The unchanged B75 literal old-Schema guard is reported separately from supported new JSON input checks; its oracle is not edited.
