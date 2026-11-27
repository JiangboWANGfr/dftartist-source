import { createElement, type ReactElement } from "react";
import type { HierClient } from "@hier/client";
import type { ObjectRef } from "@hier/protocol-types";
import {
  InstancePropertiesModel,
  ObjectConnectionsModel,
  SelectionModel,
  type ObjectConnectionsTarget,
  type ObjectSelection,
} from "@hier/viewmodel";
import { PropertiesPanel, type PropertiesPanelProps } from "@hier/views";
import {
  ObjectConnectionsView,
  type ObjectConnectionsViewCommand,
  type ObjectConnectionsViewFailure,
  type ObjectConnectionsViewProps,
} from "./object-connections-view.js";

// Compile-only host: both explicit targets come from the caller's snapshot.
// This is not an automatic Selection → target coordinator or a running demo.
async function explicitInspectorHost(
  client: HierClient,
  instance: ObjectRef,
  target: ObjectConnectionsTarget,
) {
  const snapshot = await client.ready;
  const properties = new InstancePropertiesModel(client);
  const connections = new ObjectConnectionsModel(client);
  const selection = new SelectionModel({ snapshotId: snapshot.snapshotId });
  try {
    await properties.load(instance);
    await connections.load(target);
  } catch (error) {
    properties.dispose();
    connections.dispose();
    selection.dispose();
    throw error;
  }
  const props = {
    connections,
    selection,
    ariaLabel: "Object drivers and loads",
    height: 400,
    onCommandError(failure: ObjectConnectionsViewFailure) {
      const command: ObjectConnectionsViewCommand = failure.command;
      const targetAtInvocation: ObjectConnectionsTarget = failure.target;
      const original: unknown = failure.error;
      if (failure.command === "select") {
        const selectedItem: ObjectSelection = failure.item;
        void selectedItem;
      }
      void [command, targetAtInvocation, original];
    },
  } satisfies ObjectConnectionsViewProps;
  const instanceProps = {
    properties,
    selection,
    ariaLabel: "Instance properties",
    height: 300,
  } satisfies PropertiesPanelProps;
  const panels: readonly ReactElement[] = [
    createElement(PropertiesPanel, instanceProps),
    createElement(ObjectConnectionsView, props),
  ];
  createElement(ObjectConnectionsView, { ...props, className: "inspector" });
  createElement(ObjectConnectionsView, {
    connections,
    selection,
    ariaLabel: "Connections without an instance panel",
    height: 300,
  });

  // @ts-expect-error L7 consumes its L6 model, not a second SDK query path.
  ObjectConnectionsView({ ...props, connections: client });
  // @ts-expect-error Instance properties are not the connection data model.
  ObjectConnectionsView({ ...props, connections: properties });
  // @ts-expect-error A detached array is not the shared SelectionModel.
  ObjectConnectionsView({ ...props, selection: [] });
  // @ts-expect-error The region needs an accessible label.
  ObjectConnectionsView({ connections, selection, height: 400 });
  // @ts-expect-error Height is a numerical CSS pixel value.
  ObjectConnectionsView({ ...props, height: "100%" });
  // @ts-expect-error Targets are loaded explicitly through the model.
  ObjectConnectionsView({ ...props, target });
  // @ts-expect-error There is one semantic selection channel.
  ObjectConnectionsView({ ...props, onSelect: () => {} });
  // @ts-expect-error Reach/side are in the model target, not view defaults.
  ObjectConnectionsView({ ...props, reach: "local" });
  // @ts-expect-error Exact optional fields must be omitted instead.
  ObjectConnectionsView({ ...props, onCommandError: undefined });

  // Host must unmount borrowed views before disposing these models.
  // The borrowed client is still owned by the enclosing design session.
  return { panels, properties, connections, selection };
}

const target: ObjectConnectionsTarget = {
  slice: { ref: "target-port", bits: { lsb: 2, width: 3 } },
  reach: "hier",
  side: "outside",
};
const targetFailure: ObjectConnectionsViewFailure = {
  command: "select",
  target,
  item: { ref: target.slice.ref, bits: { lsb: 2, width: 3 }, side: "outside" },
  error: undefined,
};
const endpointFailure: ObjectConnectionsViewFailure = {
  command: "select",
  target,
  item: { ref: "endpoint-process" },
  error: null,
};
const reloadFailure: ObjectConnectionsViewFailure = {
  command: "reload",
  target,
  error: undefined,
};
// @ts-expect-error Select failures retain the selected item, not just a target.
const missingItem: ObjectConnectionsViewFailure = {
  command: "select",
  target,
  error: null,
};
// @ts-expect-error Query failures do not fabricate a selected item.
const extraItem: ObjectConnectionsViewFailure = {
  command: "cancel",
  target,
  item: { ref: "endpoint" },
  error: null,
};
const definitionItem: ObjectConnectionsViewFailure = {
  command: "select",
  target,
  // @ts-expect-error This view selects objects, not definition candidates.
  item: { def: "definition" },
  error: null,
};
// @ts-expect-error Captured request coordinates are deeply readonly.
targetFailure.target.slice.bits!.width = 7;
// @ts-expect-error Captured selection coordinates are readonly.
targetFailure.item.bits!.lsb = 9;
// @ts-expect-error The original error remains unknown until the host narrows it.
reloadFailure.error.code;

void [
  explicitInspectorHost,
  endpointFailure,
  missingItem,
  extraItem,
  definitionItem,
];
