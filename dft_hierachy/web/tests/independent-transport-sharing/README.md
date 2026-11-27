# B shared-transport refactor invariance

Oracle: DESIGN 5.6.2/5.6.5/5.6.6/5.6.7 and the original B private functional contract
approved by C on 2026-10-13. Test expectations are frozen before advancing B's 2003dc0 product.
No A implementation/diff/new self-test or C probe is used.

10 cases: two public compatibility checks, eight realm/event input partitions.
S07 has two separate boundary inputs. Public export names and declaration hashes are captured from
B's original built 2003dc0, not the target implementation. Declaration-byte stability is an additional
pure-refactor artifact check, not a general rule that all compatible changes must preserve comments.

```sh
HIER_B_PRODUCT_ROOT=/absolute/B/fixed/source node --unhandled-rejections=throw --test --test-reporter=tap web/tests/independent-transport-sharing/compatibility.test.mjs
```

The real SDK and old approved private `dist/node/frame-inbox.js` entry are bundled with esbuild
platform=browser and no externals. Each control runs in a fresh JS realm with web-standard
microtask/encoding/abort APIs but no Buffer/process/require/module. Tests use only original
FrameInbox operations and real HierClient, not copied product state or a substitute inbox.

The controlled Transport in S09 is a B fixture, not IPC or Core. Realm execution is not an actual
browser, Electron/contextBridge or sandbox security proof. Lexical numeric evidence remains covered
by the unchanged B raw-wire producer/119 boundary tests through real Node NdjsonReader and SDK;
do not stringify raw tokens or move parsed objects between realms to claim evidence preservation.
The original 27 private controls remain unchanged and are run separately.

All async controls use concrete microtask order and callback observations, not fixed sleeps.
The real full 4 MiB+1 payload is UTF-8 counted. One-receiver, unsubscribe/close suppression,
FIFO/async start, bounded first-delivery buffers and normal SDK disposal are the relevant invariants.
No direct imports of newly chosen internal module paths or new product test hooks are introduced.

## Recorded fixture correction

The first 2003dc0 baseline was 9/10: S03's lexical `typeof require` was rewritten by esbuild
to its local dynamic-require shim. That is not the host global. B corrected the observation to
`typeof globalThis.require` (and the other host globals), retaining the same undefined expectation,
and added a direct pre-bundle realm check. The original frozen source and failure remain in Git/evidence.
This correction occurs before advancing the product, not after inspecting A's implementation.
