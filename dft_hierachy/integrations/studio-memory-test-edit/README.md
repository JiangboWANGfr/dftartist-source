# Memory test constraints editor

Base Hierarchy delivery: `1cfb0c3f1bd47daa7b9271ac04415986e089e4ca`, 348 Studio sources. This delta produces 352 sources. Use the original fixed helper:

    python3 integrations/studio-native-analysis/apply.py --studio ../dft_studio --delivery integrations/studio-memory-test-edit --check
    python3 integrations/studio-native-analysis/apply.py --studio ../dft_studio --delivery integrations/studio-memory-test-edit
    python3 integrations/studio-native-analysis/apply.py --studio ../dft_studio --delivery integrations/studio-memory-test-edit --verify

Apply only to the exact base, preserving other changes. DESIGN7.103 governs preview/save of explicit assignment, clock and policy groups through the existing native Schema and document writer. CLI, typed IPC and desktop form are included. No native/runtime/dependency/persistent format change. Existing fixed installation prerequisites apply; this is not a fresh installer. Evidence is in docs/evidence/a-studio-memory-test-edit-2026-11-10.* and the appended REVIEW_LOG handoff. Author validation does not represent independent B/C acceptance.
