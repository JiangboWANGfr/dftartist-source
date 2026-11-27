# Agent B — C-52 resource freeze

New C handoff arrived while final lookup report was being appended. C-51 is now closed by C. C-52 is a distinct pending High issue. No implementation/diff/C probe/A selftests read to construct this oracle.

Basis: main DESIGN §4.1 folding goal, historical accepted B C-44 relative RSS oracle (core/tests/m2/test_open_scaling.py). Reuse unchanged wait4 measurement and **3× adjacent / 5× overall** median RSS limits, no new absolute M7 SLA. Measure only Design::open/snapshot/diagnostics, never search or connection extraction. Time is recorded, not compared. Polling in the old harness waits for process completion/safety timeout, not a cancellation race oracle.

Input: existing synthetic/gen.py fanout10, depth3/4/5, unique0, three new processes per depth seeded524437 shuffle. None / EmptyLibrary / custom provider returning no cells all use identical generator bytes. Sparse mode inserts exactly one b_sparse_cell only_one(.A(d)) in top, provider returns input A width8 only for that name. No hits in repeated leaves. Expected diagnostics error0, shared fast, bodies=depth+2. Occurrences=sum(10^0..10^depth)+1 (sparse adds1), not inferred from output. Same relative tolerances for all four modes; a special-case EmptyLibrary fix cannot make custom-miss/sparse tests green.

Public-only observer target b_m3_library_open_probe; test4 methods registered independently. Baseline fixed2a58463 and current ec23459 each rebuilt/relinked by B. Freeze before running. Run relative resource gate on RelWithDebInfo: sanitizer overhead is not compared against native RSS thresholds. Preserve original C-44, all lookup/diagnostic fixtures and expectations. Original external-reference/per-instance exclusions remain covered by existing unchanged M2 suite; this probe does not prove they are correct merely by reporting fast.

No production hook/branch mutation except reversible verification checkout. Tests cover growth, not internal attribution, execution-in-progress cancellation, absolute memory limits, Linux or exhaustive resource release. C review owns implementation cause and C-52 closure. Every measurement, input/binary SHA and first failures will be retained.
