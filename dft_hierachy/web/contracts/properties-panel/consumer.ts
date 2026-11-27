import { createElement, type ReactElement } from "react";
import type { HierClient } from "@hier/client";
import type { ObjectRef } from "@hier/protocol-types";
import { InstancePropertiesModel, SelectionModel } from "@hier/viewmodel";
import {
  PropertiesPanel,
  type PropertiesPanelCommand,
  type PropertiesPanelCommandFailure,
  type PropertiesPanelProps,
} from "./properties-panel.js";

// A host provides an explicit instance; the panel never chooses a target itself.
async function explicitInstanceHost(client: HierClient, target: ObjectRef) {
  const snapshot = await client.ready;
  const properties = new InstancePropertiesModel(client);
  const selection = new SelectionModel({ snapshotId: snapshot.snapshotId });
  await properties.load(target);
  const props = {
    properties,
    selection,
    ariaLabel: "Instance properties",
    height: 480,
    onCommandError(failure: PropertiesPanelCommandFailure) {
      const command: PropertiesPanelCommand = failure.command;
      const targetAtInvocation: ObjectRef = failure.target;
      const original: unknown = failure.error;
      if (failure.command === "select") {
        const selectedRef: ObjectRef = failure.ref;
        void selectedRef;
      }
      void [command, targetAtInvocation, original];
    },
  } satisfies PropertiesPanelProps;
  const element: ReactElement = createElement(PropertiesPanel, props);
  createElement(PropertiesPanel, { ...props, className: "inspector" });
  PropertiesPanel({
    properties,
    selection,
    ariaLabel: "Fixed instance",
    height: 240,
  });

  // @ts-expect-error Consume the public model rather than querying the SDK in L7.
  PropertiesPanel({ ...props, properties: client });
  // @ts-expect-error A separate array is not the shared SelectionModel.
  PropertiesPanel({ ...props, selection: [] });
  // @ts-expect-error An accessible region label is required.
  PropertiesPanel({ properties, selection, height: 480 });
  // @ts-expect-error Viewport height is a numerical CSS pixel value.
  PropertiesPanel({ ...props, height: "100%" });
  // @ts-expect-error Target loading belongs to the explicit host/model command.
  PropertiesPanel({ ...props, target });
  // @ts-expect-error The panel has no second semantic selection channel.
  PropertiesPanel({ ...props, onSelect: () => {} });
  // @ts-expect-error Exact optional properties: omit the callback instead.
  PropertiesPanel({ ...props, onCommandError: undefined });

  // Host shutdown must unmount borrowed views before disposing these models.
  return { element, properties, selection };
}

const reloadFailure: PropertiesPanelCommandFailure = {
  command: "reload",
  target: "instance",
  error: undefined,
};
const selectFailure: PropertiesPanelCommandFailure = {
  command: "select",
  target: "instance",
  ref: "port",
  error: null,
};
// @ts-expect-error Select failures carry the actual selected source ref.
const missingRef: PropertiesPanelCommandFailure = {
  command: "select",
  target: "instance",
  error: null,
};
// @ts-expect-error Non-selection commands do not fabricate a source ref.
const extraRef: PropertiesPanelCommandFailure = {
  command: "cancel",
  target: "instance",
  ref: "port",
  error: null,
};
// @ts-expect-error Failure source fields are readonly.
selectFailure.target = "new-target";
// @ts-expect-error The original unknown error must be narrowed before use.
reloadFailure.error.code;

void [explicitInstanceHost, reloadFailure, selectFailure, missingRef, extraRef];
