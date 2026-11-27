import type { HierClient } from "@hier/client";
import type { ParamsOf } from "@hier/protocol-types";
import {
  AnnotationLayer,
  GraphSession,
  LayoutService,
  LayoutError,
  FoldProjectionError,
  type GraphFoldGroup,
  type GraphNodeId,
  type GraphSessionState,
  type GraphSource,
  type ObjectSelection,
} from "@hier/viewmodel";

/** Keep command waiters owned by the host when their borrowing view unmounts. */
class DesignLayout extends LayoutService<"folded"> {
  private readonly commands = new Set<Promise<void>>();
  private retain(command: Promise<void>): Promise<void> {
    this.commands.add(command);
    void command.then(
      () => this.commands.delete(command),
      () => this.commands.delete(command),
    );
    return command;
  }
  override layout(...input: Parameters<LayoutService<"folded">["layout"]>): Promise<void> {
    return this.retain(super.layout(...input));
  }
  override retry(): Promise<void> {
    return this.retain(super.retry());
  }
  async cancelPending(): Promise<void> {
    const commands = [...this.commands];
    // Cleanup failures belong to the original layout waiter, not necessarily to
    // cancel(). Retain both outcomes across unmount without copying model state.
    const results = await Promise.allSettled([(async () => this.cancel())(), ...commands]);
    const errors = results.flatMap((result, index) => {
      if (result.status !== "rejected") return [];
      const error: unknown = result.reason;
      if (
        index > 0 &&
        error instanceof LayoutError &&
        error.code === "cancelled" &&
        !("cause" in error && error.cause !== undefined)
      )
        return [];
      return [error];
    });
    if (errors.length) throw new AggregateError(errors, "原理图布局取消失败");
  }
}

/** Resources owned by one demo design; all semantic facts stay in the public models. */
export class DesignGraph {
  readonly graph: GraphSession;
  readonly trace: GraphSource;
  readonly example: GraphSource;
  readonly layout: DesignLayout;
  readonly annotation: AnnotationLayer;
  readonly annotations: readonly AnnotationLayer[];

  constructor(private readonly client: HierClient) {
    this.graph = new GraphSession(client);
    this.trace = this.graph.registerSource({ origin: "design", label: "Core 追踪" });
    this.example = this.graph.registerSource({ origin: "plan", label: "外部示例（非 DFT 分析）" });
    this.annotation = new AnnotationLayer({
      snapshotId: client.snapshot.snapshotId,
      id: "demo-marks",
      label: "手动标注",
    });
    this.annotations = Object.freeze([this.annotation]);
    this.layout = new DesignLayout(
      this.graph,
      {
        workerFactory: () => new Worker(new URL("./elk-worker.min.js", window.location.href)),
        timeoutMs: 15_000,
      },
      "folded",
    );
  }

  load(request: ParamsOf<"trace.cone">): Promise<void> {
    return this.trace.refresh(async ({ snapshotId, signal }) => {
      const reply = await this.client.cone(request, signal);
      return {
        snapshotId,
        nodes: reply.result.nodes.map((value) => ({ kind: "design", value })),
        edges: reply.result.edges.map((value) => ({ kind: "design", value })),
        completeness: reply.completeness,
        frontier: reply.result.frontier,
        hasConservative: reply.result.hasConservative,
      };
    });
  }

  /** Explicit workspace collapse stops work without releasing the design's retained graph. */
  async cancelPending(): Promise<void> {
    if (this.graph.disposed) return;
    // Start every cancellation even if another cleanup throws. Layout is withdrawn
    // first so its Worker is reaped before trace cancellation invalidates the graph.
    const results = await Promise.allSettled(
      [() => this.layout.cancelPending(), () => this.trace.cancel()].map(async (cancel) =>
        cancel(),
      ),
    );
    const errors = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (errors.length) throw new AggregateError(errors, "收起原理图时取消任务失败");
  }

  /** Host display policy only: Core owns object membership; the projection owns folding. */
  async instanceGroups(state: GraphSessionState, signal: AbortSignal): Promise<GraphFoldGroup[]> {
    const check = () => {
      signal.throwIfAborted();
      if (this.graph.disposed) throw new FoldProjectionError("disposed", "设计已关闭");
      if (this.graph.state !== state)
        throw new FoldProjectionError("stale_graph", "图已改变，请重新获取实例分组");
    };
    check();
    const instances = new Map<string, GraphNodeId[]>();
    const objectInstances = new Map<string, string>();
    for (const member of state.nodes) {
      if (member.node.kind !== "design") continue;
      const node = member.node.value;
      const ref = node.point?.slice.ref ?? node.ref;
      if (typeof ref !== "string") continue;
      let inst = objectInstances.get(ref);
      if (inst === undefined) {
        const reply = await this.client.object(ref, signal);
        check();
        inst = reply.result.inst;
        objectInstances.set(ref, inst);
      }
      const members = instances.get(inst) ?? [];
      members.push(member.id);
      instances.set(inst, members);
    }
    const groups: GraphFoldGroup[] = [];
    for (const [inst, nodes] of instances) {
      const reply = await this.client.instance(inst, signal);
      check();
      groups.push({
        kind: "hierarchy",
        key: JSON.stringify(["instance", inst]),
        label: `实例 ${reply.result.pathText || reply.result.name || inst}`,
        nodes,
      });
    }
    const edges = state.edges.filter((member) => member.edge.kind === "design").map((e) => e.id);
    if (edges.length >= 2) groups.push({ kind: "bus", key: "trace-bus", label: "追踪边束", edges });
    check();
    return groups;
  }

  showExample(target: ObjectSelection): Promise<void> {
    return this.example.replace({
      snapshotId: this.client.snapshot.snapshotId,
      nodes: [
        { kind: "external", key: "target", label: "示例：所选对象", ports: [], target },
        { kind: "external", key: "note", label: "示例计划节点（无设计引用）", ports: [] },
      ],
      edges: [
        {
          kind: "external",
          key: "example-link",
          label: "示例连接（非设计事实）",
          from: { node: { kind: "external", key: "target" } },
          to: { node: { kind: "external", key: "note" } },
        },
      ],
      completeness: { status: "complete", reasons: [] },
      frontier: [],
      hasConservative: false,
    });
  }

  dispose(): void {
    const errors: unknown[] = [];
    for (const resource of [this.layout, this.graph, this.annotation]) {
      try {
        resource.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "Design graph cleanup failed");
  }
}
