import type { ElectronBridge } from "@hier/client/electron/renderer";
import type { DemoBridge, DemoChoice, DemoSession, DemoFailure, DemoReply } from "@B/demo";
declare const bridge: DemoBridge,
  transport: ElectronBridge,
  choice: DemoChoice,
  session: DemoSession;
const okay: DemoReply<DemoChoice | null> = await bridge.pickDesign({
  kind: "source",
  top: "B_demo_top",
});
await bridge.pickDesign({ kind: "filelist" });
await bridge.openDesign(choice.token);
await bridge.closeDesign(session.sessionId);
if (!okay.ok) {
  const origin: "demo" = okay.error.origin;
  const cause = okay.error.cause;
  void [origin, cause];
}
const failure: DemoFailure = { code: "busy", origin: "demo", message: "B frozen error" };
void failure;
// @ts-expect-error D01 no filesystem path from renderer
bridge.pickDesign({ kind: "source", path: "/not-approved.sv" });
// @ts-expect-error D02 no process command
bridge.openDesign({ command: "/bin/sh" });
// @ts-expect-error D03 input kind required
bridge.pickDesign({});
// @ts-expect-error D04 no unknown kind
bridge.pickDesign({ kind: "project" });
// @ts-expect-error D05 exact optional top
bridge.pickDesign({ kind: "source", top: undefined });
// @ts-expect-error D06 top string
bridge.pickDesign({ kind: "source", top: 17 });
// @ts-expect-error D07 no cwd
bridge.pickDesign({ kind: "filelist", cwd: "/" });
// @ts-expect-error D08 no env
bridge.pickDesign({ kind: "source", env: { HIER_BIN: "bad" } });
// @ts-expect-error D09 open requires opaque string
bridge.openDesign(17);
// @ts-expect-error D10 close requires session identity
bridge.closeDesign({ sessionId: "B" });
// @ts-expect-error D11 readonly choice
choice.token = "replacement";
// @ts-expect-error D12 readonly session
session.sessionId = "replacement";
// @ts-expect-error D13 no invented snapshot
session.snapshotId;
// @ts-expect-error D14 bridge version cannot change
bridge.version = 2;
// @ts-expect-error D15 no generic invoke
bridge.invoke("arbitrary");
// @ts-expect-error D16 no protocol send
bridge.send("B", "{}");
// @ts-expect-error D17 original transport bridge cannot open files
transport.pickDesign({ kind: "source" });
// @ts-expect-error D18 failure has fixed origin
const wrongOrigin: DemoFailure = { code: "busy", origin: "client", message: "bad" };
// @ts-expect-error D19 finite error codes
const wrongCode: DemoFailure = { code: "anything", origin: "demo", message: "bad" };
if (!okay.ok) {
  // @ts-expect-error D20 failed reply contains no token
  void okay.value.token;
}
void [wrongOrigin, wrongCode];
