// Independent B strict consumers. Negative markers are stripped and checked individually.
import type { ReactElement } from "react";
import { PropertiesPanel } from "@hier/views";
import type {
  PropertiesPanelProps as Props,
  PropertiesPanelCommand as Command,
  PropertiesPanelCommandFailure as Failure,
} from "@hier/views";
import type { InstancePropertiesModel, SelectionModel } from "@hier/viewmodel";
declare const properties: InstancePropertiesModel,
  selection: SelectionModel,
  base: Props,
  f: Failure;
const good: Props = {
  properties,
  selection,
  height: 160,
  ariaLabel: "B panel",
};
const goodWith: Props = {
  ...good,
  className: "B",
  onCommandError(e) {
    const raw: unknown = e.error;
    const t: string = e.target;
    if (e.command === "select") {
      const r: string = e.ref;
      void r;
    }
    void raw;
    void t;
  },
};
const element: ReactElement = PropertiesPanel(goodWith);
const commands: readonly Command[] = ["reload", "cancel", "select"];
const reload: Failure = { command: "reload", target: "B", error: undefined };
const cancel: Failure = { command: "cancel", target: "B", error: 7 };
const select: Failure = {
  command: "select",
  target: "B",
  ref: "P",
  error: null,
};
void [element, commands, reload, cancel, select];
// @ts-expect-error V01: real properties model required
const a01: Props = { ...base, properties: {} };
// @ts-expect-error V02: real Selection required
const a02: Props = { ...base, selection: {} };
// @ts-expect-error V03: properties cannot be absent
const a03: Props = { selection, height: 2, ariaLabel: "B" };
// @ts-expect-error V04: selection cannot be absent
const a04: Props = { properties, height: 2, ariaLabel: "B" };
// @ts-expect-error V05: label required
const a05: Props = { properties, selection, height: 2 };
// @ts-expect-error V06: height required
const a06: Props = { properties, selection, ariaLabel: "B" };
// @ts-expect-error V07: height numeric
const a07: Props = { ...base, height: "2" };
// @ts-expect-error V08: label string
const a08: Props = { ...base, ariaLabel: 2 };
// @ts-expect-error V09: class exact optional
const a09: Props = { ...base, className: undefined };
// @ts-expect-error V10: callback exact optional
const a10: Props = { ...base, onCommandError: undefined };
// @ts-expect-error V11: callback callable
const a11: Props = { ...base, onCommandError: 2 };
// @ts-expect-error V12: class string
const a12: Props = { ...base, className: null };
// @ts-expect-error V13: no load command
const a13: Command = "load";
// @ts-expect-error V14: no clear command
const a14: Command = "clear";
// @ts-expect-error V15: select requires original ref
const a15: Failure = { command: "select", target: "B", error: 0 };
// @ts-expect-error V16: reload forbids selection ref
const a16: Failure = { command: "reload", target: "B", ref: "P", error: 0 };
// @ts-expect-error V17: cancel forbids explicit ref undefined
const a17: Failure = {
  command: "cancel",
  target: "B",
  ref: undefined,
  error: 0,
};
// @ts-expect-error V18: target required even when select ref exists
const a18: Failure = { command: "select", ref: "P", error: 0 };
// @ts-expect-error V19: original error required
const a19: Failure = { command: "reload", target: "B" };
const a20: Failure = {
  command: "select",
  target: "B",
  ref: "P",
  // @ts-expect-error V20: no synthetic row locator in failure
  rowId: "fake",
  error: 0,
};
// @ts-expect-error V21: props readonly
base.height = 4;
// @ts-expect-error V22: model binding readonly
base.properties = properties;
// @ts-expect-error V23: command readonly
f.command = "select";
// @ts-expect-error V24: target readonly
f.target = "other";
// @ts-expect-error V25: error opaque
f.error.message;
// @ts-expect-error V26: failure ref readonly
if (f.command === "select") f.ref = "other";
// @ts-expect-error V27: numeric target forbidden
const a27: Failure = { command: "cancel", target: 2, error: 0 };
// @ts-expect-error V28: numeric ref forbidden
const a28: Failure = { command: "select", target: "B", ref: 2, error: 0 };
// @ts-expect-error V29: clear is not a panel prop
const a29: Props = { ...base, clear: true };
// @ts-expect-error V30: selection cannot be explicitly absent
const a30: Props = { ...base, selection: undefined };
