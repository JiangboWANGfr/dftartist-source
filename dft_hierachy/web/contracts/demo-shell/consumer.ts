/** Compile-only composition of production packages, not a demo runtime. */
import { createElement } from "react";
import type { HierClient } from "@hier/client";
import type { ElectronBridge } from "@hier/client/electron/renderer";
import {
  DefinitionInstancesModel,
  InstancePropertiesModel,
  ObjectConnectionsModel,
  PathResolutionModel,
  SearchModel,
  SelectionModel,
  SourceNavigationModel,
  TreeModel,
} from "@hier/viewmodel";
import {
  DefinitionInstancesView,
  HierarchyTree,
  ObjectConnectionsView,
  PathResolutionView,
  PropertiesPanel,
  SearchResultsView,
  SourceCandidatesView,
  SourceView,
} from "@hier/views";
import type { DemoBridge, DemoChoice, DemoSession } from "./bridge.js";

/** Caller owns the client; this example only allocates and releases models. */
export async function composePanels(client: HierClient, report: (error: unknown) => void) {
  const { snapshotId } = await client.ready;
  const selection = new SelectionModel({ snapshotId });
  const tree = new TreeModel(client);
  const properties = new InstancePropertiesModel(client);
  const connections = new ObjectConnectionsModel(client);
  const navigation = new SourceNavigationModel(client);
  const search = new SearchModel(client);
  const instances = new DefinitionInstancesModel(client);
  const resolution = new PathResolutionModel(client);
  const feedback = (failure: { readonly error: unknown }) => report(failure.error);
  const models = [
    tree,
    properties,
    connections,
    navigation,
    search,
    instances,
    resolution,
    selection,
  ];
  return {
    selection,
    tree,
    properties,
    connections,
    navigation,
    search,
    instances,
    resolution,
    // The future host subscribes to models; this function just checks real props.
    render: () => [
      createElement(HierarchyTree, {
        tree,
        selection,
        ariaLabel: "设计层级",
        height: 600,
        onCommandError: feedback,
      }),
      createElement(PropertiesPanel, {
        properties,
        selection,
        ariaLabel: "实例属性",
        height: 400,
        onCommandError: feedback,
      }),
      createElement(ObjectConnectionsView, {
        connections,
        selection,
        ariaLabel: "对象连接",
        height: 400,
        onCommandError: feedback,
      }),
      createElement(SourceView, {
        state: navigation.state.document,
        ariaLabel: "设计源码",
        height: 400,
        positionQuery: {
          locate: (document, offset) => navigation.locate(document, offset),
          onError: feedback,
        },
      }),
      createElement(SourceCandidatesView, {
        navigation,
        selection,
        ariaLabel: "源码候选",
        height: 200,
        onCommandError: feedback,
      }),
      createElement(SearchResultsView, {
        search,
        selection,
        ariaLabel: "搜索结果",
        height: 400,
        onCommandError: feedback,
      }),
      createElement(DefinitionInstancesView, {
        instances,
        selection,
        ariaLabel: "定义实例",
        height: 400,
        onCommandError: feedback,
      }),
      createElement(PathResolutionView, {
        resolution,
        selection,
        ariaLabel: "路径候选",
        height: 400,
        onCommandError: feedback,
      }),
    ],
    submitSearch: (text: string) => search.load({ snapshotId, text }),
    submitPath: (text: string) => resolution.load({ snapshotId, text }),
    release: () => {
      for (const model of models) model.dispose();
    },
  };
}

/** The two host capabilities remain distinct even in the same preload. */
export async function controlTypes(
  demo: DemoBridge,
  transport: ElectronBridge,
  choice: DemoChoice,
  session: DemoSession,
): Promise<void> {
  const picked = await demo.pickDesign({ kind: "filelist", top: "processor_core" });
  if (picked.ok && picked.value !== null) {
    const opened = await demo.openDesign(picked.value.token);
    if (opened.ok) await demo.closeDesign(opened.value.sessionId);
    else {
      const origin: "demo" = opened.error.origin;
      void origin;
    }
  }
  // @ts-expect-error DEMO01 the renderer cannot submit a filesystem path
  await demo.pickDesign({ kind: "source", path: "/tmp/design.sv" });
  // @ts-expect-error DEMO02 no raw executable or shell configuration
  await demo.openDesign({ command: "/bin/sh", args: ["-c", "anything"] });
  // @ts-expect-error DEMO03 an input kind is required
  await demo.pickDesign({ top: "processor_core" });
  // @ts-expect-error DEMO04 exact optional top does not accept undefined
  await demo.pickDesign({ kind: "source", top: undefined });
  // @ts-expect-error DEMO05 no working directory control in renderer
  await demo.pickDesign({ kind: "filelist", cwd: "/" });
  // @ts-expect-error DEMO06 selection identity is readonly
  choice.token = "other";
  // @ts-expect-error DEMO07 session identity is readonly
  session.sessionId = "other";
  // @ts-expect-error DEMO08 an open reply does not invent Core snapshot identity
  void session.snapshotId;
  // @ts-expect-error DEMO09 the demo bridge is not a generic IPC client
  demo.invoke("arbitrary-channel");
  // @ts-expect-error DEMO10 the original package bridge cannot open a design
  transport.openDesign(choice.token);
  // @ts-expect-error DEMO11 the demo bridge cannot forward protocol messages
  demo.send(session.sessionId, "{}");
  if (!picked.ok) {
    // @ts-expect-error DEMO12 a failed selection cannot issue a token
    void picked.value.token;
  }
}
