# Saved native task → reusable Tcl document

This delta follows `studio-native-tcl` at `99cd5fb9fbbe52ce060a6c6437c115a6dc299140`. The existing non-Git Studio product receives twenty changed/new files, pinned by a 178-source manifest and gzip patch. Dependencies, Node0.4/Tcl9.0.4 and native/Core/SDK pins remain unchanged.

```sh
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-native-script --studio /absolute/existing/studio --check
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-native-script --studio /absolute/existing/studio
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-native-script --studio /absolute/existing/studio --verify
```

Use Node24 and the existing build workflow. Completed native tasks now offer a deterministic Tcl preview, digest-matched exclusive export, or a new bound `text.tcl` file that opens in the existing online/offline editor. The existing automation panel explicitly runs the saved script with current project inputs. No script is automatically executed by preview/create/export.

Original document creation gains optional `initialText`; omitted text still creates an empty file. The same exclusive file publication, project/path/identity checks and preserve-unbound-file policy remain. Three old input schemas extend compatibly; other old definitions and commands remain, with six new DTOs/three commands. No old project/task migration, new domain algorithm or full S2/S3/S4 claim. See DESIGN7.59, its plan and author evidence.
