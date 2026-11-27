# Studio native reports and source evidence

Actual Studio changes live in the existing sibling `dft_studio` product. This fixed delta applies after the `studio-native-analysis` delivery at Hierarchy `1c75b519a6327c9651a13c24456c9e25a97a48fa`.

Use the shared replayer from the original delivery:

```sh
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-native-review --studio /absolute/existing/studio --check
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-native-review --studio /absolute/existing/studio
python3 integrations/studio-native-analysis/apply.py --delivery integrations/studio-native-review --studio /absolute/existing/studio --verify
```

Preflight refuses differing baseline files and new-path collisions. The manifest pins all 170 resulting source files and the actual bundled Node 0.4.0 archive. Existing Core, SDK, Tcl and native CLI archives remain from the preceding product. Use Node 24, install local dependencies, verify the existing native installation, then `npm run build:desktop`.

This adds four GUI starter profiles, original structured reports and digest-checked read-only source, plus `analyze report` and `analyze source`. Saved 0.3.1 tasks stay byte-identical; historical freshness remains unknown. No automatic RTL writing or complete Studio S2/S3/S4 claim. See DESIGN 7.57, the execution plan and the author evidence for actual validation and independent review limits.
