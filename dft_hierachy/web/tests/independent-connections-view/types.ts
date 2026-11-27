// Independent B consumers of DESIGN §6.21; strip every marker to verify its diagnostic.
import type { ReactElement } from "react";
import { ObjectConnectionsView } from "@hier/views";
import type {
  ObjectConnectionsViewProps as Props,
  ObjectConnectionsViewCommand as Command,
  ObjectConnectionsViewFailure as Failure,
} from "@hier/views";
import type {
  ObjectConnectionsModel,
  ObjectConnectionsTarget as Target,
  ObjectSelection,
  SelectionModel,
} from "@hier/viewmodel";

declare const connections: ObjectConnectionsModel,
  selection: SelectionModel,
  base: Props,
  f: Failure,
  sf: Extract<Failure, { command: "select" }>;

const t: Target = {
  slice: { ref: "B-query", bits: { lsb: 0, width: 2 } },
  reach: "hier",
  side: "outside",
};
const whole: Target = { slice: { ref: "B-whole" }, reach: "local" };
const selected: ObjectSelection = {
  ref: t.slice.ref,
  bits: { lsb: 0, width: 2 },
  side: "outside",
};
const good: Props = {
  connections,
  selection,
  ariaLabel: "B connections",
  height: 160,
};
const goodWith: Props = {
  ...good,
  className: "",
  onCommandError(value) {
    const target: Target = value.target;
    const raw: unknown = value.error;
    if (value.command === "select") {
      const item: ObjectSelection = value.item;
      const ref: string = item.ref;
      void [item, ref];
    }
    void [target, raw];
  },
};
const element: ReactElement = ObjectConnectionsView(goodWith);
const commands: readonly Command[] = ["reload", "cancel", "select"];
const reload: Failure = { command: "reload", target: t, error: undefined };
const cancel: Failure = { command: "cancel", target: whole, error: 0 };
const select: Failure = {
  command: "select",
  target: t,
  item: selected,
  error: Symbol("B raw"),
};
const endpoint: Failure = {
  command: "select",
  target: t,
  item: { ref: "B-endpoint-not-query" },
  error: null,
};
void [element, commands, reload, cancel, select, endpoint];

// @ts-expect-error V01: a real connections model is required
const n01: Props = { ...base, connections: {} };
// @ts-expect-error V02: a real selection model is required
const n02: Props = { ...base, selection: {} };
// @ts-expect-error V03: connections is required
const n03: Props = { selection, height: 2, ariaLabel: "B" };
// @ts-expect-error V04: selection is required
const n04: Props = { connections, height: 2, ariaLabel: "B" };
// @ts-expect-error V05: ariaLabel is required
const n05: Props = { connections, selection, height: 2 };
// @ts-expect-error V06: height is required
const n06: Props = { connections, selection, ariaLabel: "B" };
// @ts-expect-error V07: height is numeric, not coercible text
const n07: Props = { ...base, height: "2" };
// @ts-expect-error V08: ariaLabel is a primitive string
const n08: Props = { ...base, ariaLabel: 2 };
// @ts-expect-error V09: className follows exact optional typing
const n09: Props = { ...base, className: undefined };
// @ts-expect-error V10: the optional callback cannot be explicitly undefined statically
const n10: Props = { ...base, onCommandError: undefined };
// @ts-expect-error V11: the optional callback must be callable
const n11: Props = { ...base, onCommandError: 2 };
// @ts-expect-error V12: load is not a view command
const n12: Command = "load";
// @ts-expect-error V13: select failure requires its captured item
const n13: Failure = { command: "select", target: t, error: 0 };
// @ts-expect-error V14: reload failure cannot carry a selection item
const n14: Failure = { command: "reload", target: t, item: selected, error: 0 };
// @ts-expect-error V15: cancel forbids explicit item undefined under exact optional typing
const v: Failure = { command: "cancel", target: t, item: undefined, error: 0 };
// @ts-expect-error V16: target is required even when an item is present
const n16: Failure = { command: "select", item: selected, error: 0 };
// @ts-expect-error V17: the original unknown error is required
const n17: Failure = { command: "reload", target: t };
// @ts-expect-error V18: target is the structured connections target, not an object ref
const n18: Failure = { command: "cancel", target: "B-query", error: 0 };
// @ts-expect-error V19: the captured item is ObjectSelection, not a definition selection
const n19: typeof sf.item = { def: "B-definition" };
// @ts-expect-error V20: the original error remains unknown
f.error.message;
// @ts-expect-error V21: props are readonly
base.height = 4;
// @ts-expect-error V22: the captured target slice is deeply readonly
f.target.slice.ref = "B-other";
// @ts-expect-error V23: the captured item bit range is deeply readonly
sf.item.bits!.lsb = 1;
// @ts-expect-error V24: query options do not become root view props
ObjectConnectionsView({ ...good, reach: "hier" });
