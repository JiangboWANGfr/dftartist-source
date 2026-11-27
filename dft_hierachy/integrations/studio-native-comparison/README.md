# Fixed Studio native report comparison delta

Apply after `ab1aca60a2b5343287382617e215e1ac50f763f9` / `integrations/studio-native-script`.
The actual non-Git Studio source tree is updated; this directory fixes the exact before/after source bytes for review and replay. No dependency or native binary change.

```sh
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-native-comparison --studio /path/to/studio --check
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-native-comparison --studio /path/to/studio
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-native-comparison --studio /path/to/studio --verify
```

`analysis.native.compare` is read-only bounded structural JSON inspection of original validated saved reports. The reviewed comparison export uses the existing exclusive new-file publisher. CLI, explicit Tcl read command, strict IPC and Tasks comparison/source controls share the existing history, source reader and export services. Existing `run.compare`, all previous definitions/command descriptors and storage formats remain unchanged. This delta is A implementation/testing, not independent B/C acceptance.

See DESIGN7.60, docs/plans/studio-native-comparison.md and docs/evidence/a-studio-native-comparison-2026-11-09.md for actual commands/results/limits. The patch has no runtime packages; use the preceding fixed Node0.4/Tcl9.0.4/Core/SDK/native pins.
