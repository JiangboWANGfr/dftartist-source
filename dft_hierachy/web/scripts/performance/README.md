# Product performance measurements

Run from the repository root with Node 24 and this checkout's optimized Core:

```sh
HIER_BIN="$PWD/core/build/hier" npm --prefix web run perf -- \
  --output /tmp/hier-performance-NEW \
  --processor-filelist "$PWD/../nx9000/design/processor_core/processor_core.vc" \
  --openc910-design "$PWD/../openc910/design"
```

The output directory must not exist. Missing executables/dependencies, incomplete
results and cleanup failures fail the command. `report.json` is updated after
each sample, including on failure; a second run never overwrites old evidence.
The generated HDL, browser bundle, pinned ELK Worker and screenshots remain in
that directory. Real designs and B's frozen inputs are read-only.

Defaults: five fresh Core processes per design, 10,000 and 100,000 child instances,
200-item SDK pages, 100/500/2,000-node layout graphs. A small development smoke is:

```sh
HIER_BIN="$PWD/core/build/hier" npm --prefix web run perf -- \
  --output /tmp/hier-performance-SMOKE-NEW \
  --repetitions 1 --instances 20 --graphs 10
```

Core samples use the production SDK and Node transport with SDK caching disabled.
They distinguish process-to-ready opening, first search (including any index work
required by that query), warm
search, all direct-child pages, local cancellation, cancellation followed by a
Core round trip, and process shutdown. Input hashes, binary/asset hashes, raw
samples, machine/version details and nearest-rank P50/P95 are recorded. With five
samples, P95 is the maximum; this is a baseline, not a stable tail-latency estimate.
The first 200 search results do not imply that a whole-design index was built.
Each design also gets five fresh-process close samples immediately after submitting
a query. They retain the actual exit code/signal and exercise the existing 2000ms
transport shutdown grace; a normal exit does not prove that the kill fallback ran.

The browser uses the same real Core through a benchmark-only frame bridge, real
TreeModel/HierarchyTree and real GraphSession/LayoutService with the published
native ELK Worker. It loads all synthetic children, checks that tree DOM stays
bounded by the 560px viewport, lays out a two-successor DAG, cancels native work
and checks Worker/view cleanup. These graph inputs are explicitly external display
objects. They do not pretend to be netlist facts or full-chip rendering.

RSS is sampled from owned Core processes using `ps` every 50ms: the reported peak
is a **sampled lower bound**, not the OS high-water mark. SDK process memory before
and after close is also retained. Chromium's CDP reports renderer V8 heap at
checkpoints before Core opening, after tree loading, after layouts and after
release; this excludes native allocations and Worker heaps. None of these values
is a leak proof, and release does not imply immediate garbage collection. The RSS
collector has been exercised on macOS; other platforms need validation before
comparing their numbers. Cancellation samples
can be queued or running and cannot establish a worst-case Slang interruption
bound. The 180s run / 120s layout deadlines are harness watchdogs, not user budgets.
Cold means a new Core process, not a cleared OS filesystem cache. Avoid concurrent
builds/GUI tests and record external load or sleep before comparing measurements.

This tool supplies M7/A22 evidence. It does not set product resource limits, replace
semantic regressions, close historical B/C issues or assert cross-platform coverage.
The demo host now applies the user-approved policy documented in DESIGN §5.6.5;
this measurement tool keeps its explicit harness settings. XiangShan inputs and
toolchain provenance are recorded separately from synthetic scale measurements.
The synthetic modules deliberately share one resolved output net: cold signal
analysis includes dense driver checks, so its cancellation cost is not a typical
per-instance constant. Preserve that workload when comparing revisions.

`npm --prefix web run test:performance-tools` checks statistics, failure reporting,
owned-process cleanup and preservation of previous output. It also runs a real
small Core/browser control plus SIGTERM/SIGKILL exit negative controls, so it
requires this checkout's built Core (or an explicit HIER_BIN). It is included in
`check.sh`. Scale measurements remain an explicit command so routine tests do not
silently become machine-dependent performance gates.
