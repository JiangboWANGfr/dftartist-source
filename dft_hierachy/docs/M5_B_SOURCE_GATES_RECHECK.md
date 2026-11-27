# B7 Source gate wiring recheck

Fixed product **fd08ae787ba9f3c85ef83408a5d7fcb96b6af082**, wiring c64e9e5.
Test facilities frozen **4f974fb9bf4b948ce779c4570802a726c30daef9** before execution.
DESIGN SHA256 **75e20f5b0637515f103c1cfdf508db227c155570c58baded3ec0de17011788a5**.
[Acceptance/input plan](plans/M5-source-gates-independent.md).
[Machine evidence](m5_b_source_gates_recheck.json).

Result: ordinary fixed path M4 **294/294**, complete standard **1628/1628**,
zero fail/skip. New wrapper facilities **20/20**, separately counted.
The latest C-84 path finding is valid and is handled as a separate B-owned test
infrastructure correction; ordinary-path green is not portable-checkout approval.
Do not close C-84 from this report.

## Actual commands and scope

Product P=`/tmp/hier-b-orch7-gates.WmVvAE3d/source`; B=`/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree`.
Node24.21.0, macOS arm64. PATH starts with the global Node24 installation.
All full command argv/cwd/UTC/exit/time/combined outputs are in the archive.

| Actual command / cwd                                                                                            | Exit / result                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `git worktree add --detach P fd08ae7`; `npm --prefix web ci --offline --no-audit --no-fund` / P                 | 0/0; independent pure checkout, 71 packages                                                                                                     |
| `npm --prefix web run check` / P                                                                                | 0; 195 definitions/27 methods, four TS packages, layering and seven rejection probes                                                            |
| Six dependency SHA/clean checks; CMake configure and `cmake --build core/build-b-review --target hier -j 4` / P | 0; fresh RelWithDebInfo, M3/FUTURE ON, observer/sanitize/experiments OFF; **79.46 sec**, zero build warnings                                    |
| `HIER_BIN=P/core/build-b-review/hier npm --prefix web run test:independent:m4` / P                              | 0; **294=268 TAP+26**, 3.10 sec, zero skip                                                                                                      |
| `HIER_BIN=P/core/build-b-review/hier npm --prefix web run test:independent` / P                                 | 0; **1628=810 TAP+26+281+5+99+25+12+40+6+306+4+14**, 18.60 sec, zero skip; one complete command, not assembled reruns                           |
| `HIER_B_PRODUCT_ROOT=P node --test web/tests/independent-source-gates/wrapper.facility.test.mjs` / B            | 0; 20 real OS subprocess facilities: normal order/cwd/root/env/args, each child exit23/signal/missing, two invalid modes; not product semantics |
| Identity runtime/type and BD timing `--list` / B                                                                | 0; 26/7/4 exactly equal prior B archive lists                                                                                                   |
| `audit.mjs --declarations` with explicit main/P and old-log-prefix environment / B                              | 0; three whole import patches/17 final blobs, Source15, 37 declarations, tracked/untracked/log preservation                                     |
| Historical B6 `recheck/verify-evidence.mjs`, explicitly against its original e4ba060+7-overlay tree / B         | 0; 53 historical captures/41 pins, zero current semantics; old red results retained                                                             |
| `bash -n check.sh`, relevant Prettier checks, whitespace checks                                                 | 0; formatting is separate from semantic claims                                                                                                  |

Binary **9324344 bytes**, SHA256
**557048b88560a9acc42bed5388a2aee25d55a54dc937294ee8a148574c01d451**.
Only verified third-party source was reused; no A/C product objects or binaries.
Own Core processes after actual tests: zero (bounded process observation, not
a universal leak guarantee).

Identity7 types execute through S02, not again in the identity wrapper. Source34,
other types, bundle metadata, facilities and overlapping subsets are not added
to runtime counts. Source model310 and Core14 are reached within the full command;
Source implementation/property/renderer acceptance is not reopened.

## Byte protection and evidence integrity

Three B originals 053b5ad/aad11d6/d07131c exactly match a99d44d/f3c49ce/9501273,
including entire binary patches and final17 paths. Original Source15 are unchanged.
Core/protocol tree identities match e4ba060. The sole production-package-directory
change is client README; all runtime files and37 compiled declarations are unchanged.
check.sh itself is unchanged; only test wrappers/package callers are relevant.

Original B **567** tracked files, fixed product **826**, shared **825** non-log files
and **18** original untracked files remain intact. Original log prefix
**1623185 bytes**, SHA256
**e917af189609da80ef11d33d4f937143f6b475d9254759e722203bdeb6f54ff8**, preserved.
Shared log is only appended, never committed. No A production implementation/diff
or selftest was used to construct an oracle; delivery summaries were read, so
this is not strictly blind. Existing B-internal auxiliary only provided static
QA; its statements are not independent C or actual B test execution.

Archive: **235553 bytes**, SHA256
**d5d02a320b07139732ff1e029ecaa9bf9c8107a25a33f9ec295075aeea3878bf**. **31 named complete captures**, 77 product pins,
4 B input pins, 1 original audit source material; capture outputs **322060 raw /
73296 gzip bytes**. The initial provenance check exit1 incorrectly included the
whole web/packages tree in runtime identity; client README was the only change.
Corrected to require that exact sole documentation path, not to accept arbitrary
runtime changes; original failed output/source retained. No product semantic red
was suppressed. An ad-hoc nonexistent generated build.make lookup was a diagnostic
path mistake, not a build or product failure.

`HIER_B_PRODUCT_ROOT=P node web/tests/independent-source-gates/verify-evidence.mjs`
verifies these exact historical captures/pins, counts and binary; **zero product
semantics are executed by the verifier**. Later archive formatting/verifier/report/
commit/append checks are actual but outside this finite archive (no recursion).
Historical B5/B6 verifiers are unchanged and not retargeted to current HEAD.

## Limits and handoff

No repeated native CTest trio/Debug/ASan, TS Schema655, full check.sh or A selftest
execution for this documentation/wiring-only increment; prior A/C/B results keep
their original ownership. No top-level npm fault injection; actual normal entry
commands and thin wrapper OS failures were tested, caller &&/set-e were inspected.
Child-module absence is nonzero subprocess execution, not OS spawn ENOENT;
spawn-error/null-status branches were not injected.

Not real Electron main/preload/IPC/permission/navigation/crash tests, production
React UI/AX, SourceView/reverse candidates/Selection coordination, L06/L09–11,
M7, Linux/remote CI or generic leak/SLA acceptance. Browser gate only bundles,
loads without Node globals and checks factory shape, not factory invocation in
that realm. No persistence or migration format is in scope.

**A:** ordinary fixed wiring/30 new inputs accepted. Absorb B's forthcoming C-84
path-only correction unchanged before portable-checkout closeout.
**C:** review import/facility/count evidence; only C may close C-84 after its own
review. BD-SOURCE-01 remains B-closed; no new product contract.
**D/coordinator:** D-03 remains M6-only, Source data unit is not M5 completion.
No new sessions/timers/ACD messages or old monitor acknowledgements.
