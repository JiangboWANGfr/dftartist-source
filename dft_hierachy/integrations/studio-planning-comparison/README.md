# Saved planning record comparison

Base: dd576891cfcb6b1dc7f507298174f5ee6feb47ba, 343 Studio source files. This fixed delta produces 348 sources. Apply with the original generic helper:

    python3 integrations/studio-native-analysis/apply.py --studio ../dft_studio --delivery integrations/studio-planning-comparison --check
    python3 integrations/studio-native-analysis/apply.py --studio ../dft_studio --delivery integrations/studio-planning-comparison
    python3 integrations/studio-native-analysis/apply.py --studio ../dft_studio --delivery integrations/studio-planning-comparison --verify

Only apply to the exact base, preserving other changes. DESIGN 7.101 directory clarification and 7.102 govern this addition. API/CLI/typed IPC/desktop select original Memory/Wrapper records, compare saved JSON and export the reviewed response exclusively. No runtime/native package, persistent format or original command/schema changes. Follow the existing fixed installation instructions before build:desktop; this delta is not a new installer. Verification and limitations are recorded in docs/evidence/a-studio-planning-comparison-2026-11-10.* and REVIEW_LOG.
