# Studio native Tcl workflow

This additive delta follows `studio-native-review` at `f148a34ad4e9509f298c986c11537bfad8abfe39` in the existing non-Git Studio product. It pins 174 resulting source files and ten changed/new files. Existing Node 0.4.0, Tcl 9.0.4, native tools, Core and SDK pins stay unchanged.

```sh
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-native-tcl --studio /absolute/existing/studio --check
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-native-tcl --studio /absolute/existing/studio
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-native-tcl --studio /absolute/existing/studio --verify
```

Use the same Node 24 build workflow. `examples/native-tcl/flow.tcl` runs four tools, reads verified reports/source, and makes an explicit current-input rerun via the original RunService. Both the workbench Console and saved Tcl execution consume the same commands. Native arguments are actual bounded Tcl string lists, not JSON/evaluated text. Script/Console tasks keep original outcomes, history and ownership/cleanup. No new task store, project migration, domain algorithm, automatic RTL write or full S2/S3/S4 claim. See DESIGN7.58, the execution plan and author evidence.
