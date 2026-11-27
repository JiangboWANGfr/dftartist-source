import type { HierClient } from "@hier/client";
import type { SourceKind } from "@hier/protocol-types";
import {
  DefinitionInstancesModel,
  InstancePropertiesModel,
  ObjectConnectionsModel,
  PathResolutionModel,
  SearchModel,
  SelectionModel,
  SourceNavigationModel,
  TreeModel,
  type Selection,
} from "@hier/viewmodel";
import { DesignGraph } from "./design-graph.js";
import { QueryCommandFeedback } from "./query-command-feedback.js";

interface SelectionContext {
  readonly generation: number;
  readonly sourceGeneration: number;
}

/** Host coordination only. Each model remains authoritative for its query state. */
export class DesignPanels {
  readonly selection: SelectionModel;
  readonly tree: TreeModel;
  readonly properties: InstancePropertiesModel;
  readonly connections: ObjectConnectionsModel;
  readonly navigation: SourceNavigationModel;
  readonly search: SearchModel;
  readonly instances: DefinitionInstancesModel;
  readonly resolution: PathResolutionModel;
  readonly designGraph: DesignGraph;
  private generation = 0;
  private reportGeneration = 0;
  private sourceGeneration = 0;
  private sourceContext: SelectionContext | undefined = {
    generation: this.generation,
    sourceGeneration: this.sourceGeneration,
  };
  private lookup: AbortController | undefined;
  private disposed = false;
  private readonly subscriptions: (() => void)[] = [];
  private readonly searchFeedback: QueryCommandFeedback;
  private readonly pathFeedback: QueryCommandFeedback;
  private readonly connectionFeedback: QueryCommandFeedback;
  private readonly traceFeedback: QueryCommandFeedback;

  constructor(
    readonly client: HierClient,
    private readonly report: (error: unknown, current: () => boolean) => void,
  ) {
    this.selection = new SelectionModel({ snapshotId: client.snapshot.snapshotId });
    this.tree = new TreeModel(client);
    this.properties = new InstancePropertiesModel(client);
    this.connections = new ObjectConnectionsModel(client);
    this.navigation = new SourceNavigationModel(client);
    this.search = new SearchModel(client);
    this.instances = new DefinitionInstancesModel(client);
    this.resolution = new PathResolutionModel(client);
    this.designGraph = new DesignGraph(client);
    const consumeCommand = (command: Promise<void>, current: () => boolean) =>
      this.consume(command, this.generation, undefined, current);
    this.searchFeedback = new QueryCommandFeedback(this.search, consumeCommand);
    this.pathFeedback = new QueryCommandFeedback(this.resolution, consumeCommand);
    this.connectionFeedback = new QueryCommandFeedback(this.connections, consumeCommand);
    const { graph, trace } = this.designGraph;
    this.traceFeedback = new QueryCommandFeedback(
      {
        get state() {
          return trace.state;
        },
        subscribe(listener) {
          let state = trace.state;
          return graph.subscribe(() => {
            const next = trace.state;
            // A graph publishes all sources; only this source can supersede its waiter.
            if (state === next) return;
            state = next;
            listener();
          });
        },
      },
      (command, current) => {
        // replace() can supersede pending work by publishing success directly.
        const revision = trace.state.revision;
        this.consume(
          command,
          this.generation,
          undefined,
          () => current() && trace.state.revision === revision,
        );
      },
    );
    for (const feedback of [
      this.searchFeedback,
      this.pathFeedback,
      this.connectionFeedback,
      this.traceFeedback,
    ])
      this.subscriptions.push(() => feedback.dispose());
    this.subscriptions.push(this.selection.subscribe((selection) => this.selected(selection)));
    let completion: Promise<void> | undefined;
    this.subscriptions.push(
      this.navigation.subscribe(() => {
        const next = this.navigation.state.refresh?.completion;
        if (next && next !== completion) {
          completion = next;
          const context = this.sourceContext;
          this.consume(
            next,
            context?.generation ?? this.generation,
            context?.sourceGeneration ?? this.sourceGeneration,
            () => context !== undefined && this.sourceContext === context,
          );
        }
      }),
    );
  }

  /** Stable for this workspace; views retain it for their own command lifetime. */
  readonly onCommandError = ({ error, current = () => true }: {
    readonly error: unknown;
    readonly current?: () => boolean;
  }): void => {
    if (this.disposed || !current()) return;
    const generation = this.generation;
    const report = ++this.reportGeneration;
    // The renderer formats unknown values; keep the original operation's probe live until publication.
    this.report(error, () =>
      !this.disposed && generation === this.generation &&
      report === this.reportGeneration && current(),
    );
  };

  /** Attach rejection handling immediately, with ownership fixed at issuance. */
  consume(
    command: Promise<unknown>,
    generation = this.generation,
    sourceGeneration?: number,
    current: () => boolean = () => true,
  ): void {
    const eligible = () =>
      !this.disposed && current() && generation === this.generation &&
      (sourceGeneration === undefined || sourceGeneration === this.sourceGeneration);
    void command.catch((error: unknown) => {
      if (eligible()) this.onCommandError({ error, current: eligible });
      else console.debug("Superseded design command settled", error);
    });
  }

  searchText(text: string): Promise<void> {
    return this.searchFeedback.run(() =>
      this.search.load({ snapshotId: this.client.snapshot.snapshotId, text }),
    );
  }

  resolvePath(text: string): Promise<void> {
    return this.pathFeedback.run(() =>
      this.resolution.load({ snapshotId: this.client.snapshot.snapshotId, text }),
    );
  }

  loadConnections(target: Parameters<ObjectConnectionsModel["load"]>[0]): Promise<void> {
    return this.connectionFeedback.run(() => this.connections.load(target));
  }

  loadTrace(request: Parameters<DesignGraph["load"]>[0]): Promise<void> {
    return this.traceFeedback.run(() => this.designGraph.load(request));
  }

  cancelTrace(): Promise<void> {
    return this.traceFeedback.run(() => this.designGraph.trace.cancel());
  }

  clearTrace(): Promise<void> {
    return this.traceFeedback.run(() => this.designGraph.trace.clear());
  }

  private selected(selection: Selection): void {
    const generation = ++this.generation;
    const sourceGeneration = ++this.sourceGeneration;
    this.lookup?.abort();
    this.lookup = undefined;
    const item = selection.items.length === 1 ? selection.items[0] : undefined;
    const preserveSource = !!item && selection.origin === "source";
    const context = { generation, sourceGeneration };
    this.sourceContext = preserveSource ? context : undefined;
    // Confirmation retains the binding: its in-flight refresh belongs to the new selection.
    const refresh = preserveSource ? this.navigation.state.refresh?.completion : undefined;
    if (refresh)
      this.consume(refresh, generation, sourceGeneration, () => this.sourceContext === context);
    this.afterNotification(generation, () =>
      this.applySelection(selection, context, preserveSource),
    );
  }

  /** Revoke synchronously; mutate borrowed models only after their notification stack exits. */
  private afterNotification(
    generation: number,
    command: () => void,
    sourceGeneration?: number,
  ): void {
    const current = () =>
      !this.disposed &&
      generation === this.generation &&
      (sourceGeneration === undefined || sourceGeneration === this.sourceGeneration);
    queueMicrotask(() => {
      if (!current()) return;
      try {
        command();
      } catch (error) {
        if (current()) this.onCommandError({ error });
        else console.debug("Superseded design coordination settled", error);
      }
    });
  }

  private sourceCommand(context: SelectionContext, begin: () => Promise<void>): void {
    if (
      this.disposed ||
      context.generation !== this.generation ||
      context.sourceGeneration !== this.sourceGeneration
    )
      return;
    this.sourceContext = context;
    let command: Promise<void>;
    try {
      command = begin();
    } catch (error) {
      command = Promise.reject(error);
    }
    this.consume(
      command,
      context.generation,
      context.sourceGeneration,
      () => this.sourceContext === context,
    );
  }

  private applySelection(
    selection: Selection,
    context: SelectionContext,
    preserveSource: boolean,
  ): void {
    const { generation, sourceGeneration } = context;
    const current = () => !this.disposed && generation === this.generation;
    this.consume(this.tree.cancel(null), generation);
    if (!current()) return;
    this.consume(this.properties.clear(), generation);
    if (!current()) return;
    this.consume(this.connections.clear(), generation);
    if (!current()) return;
    this.consume(this.instances.clear(), generation);
    if (!current()) return;
    const item = selection.items.length === 1 ? selection.items[0] : undefined;
    // Clear the old binding before a later explicit source job runs, even if it superseded default loading.
    if (!preserveSource) this.consume(this.navigation.clear(), generation, sourceGeneration);
    if (!current() || !item) return;
    if (item.def !== undefined) {
      this.consume(
        this.instances.load({ snapshotId: this.client.snapshot.snapshotId, def: item.def }),
        generation,
      );
      if (current() && !preserveSource)
        this.sourceCommand(context, () => this.navigation.load(item.def!, "definition"));
      return;
    }
    const controller = new AbortController();
    this.lookup = controller;
    this.consume(
      (async () => {
        const object = await this.client.object(item.ref, controller.signal);
        if (this.disposed || generation !== this.generation || controller.signal.aborted) return;
        this.consume(this.properties.load(object.result.inst), generation);
        if (!current()) return;
        this.consume(this.tree.reveal(item.ref), generation);
        if (!current()) return;
        if (!preserveSource)
          this.sourceCommand(context, () => this.navigation.load(item.ref, "definition"));
        if (
          !this.disposed &&
          generation === this.generation &&
          !controller.signal.aborted &&
          (object.result.kind === "port" || object.result.kind === "signal")
        )
          this.loadConnections({
            slice: { ref: item.ref, ...(item.bits === undefined ? {} : { bits: item.bits }) },
            reach: "local",
            ...(item.side === undefined ? {} : { side: item.side }),
          });
      })(),
      generation,
    );
  }

  sourceKind(kind: SourceKind): void {
    const items = this.selection.current.items;
    const item = items.length === 1 ? items[0] : undefined;
    if (!item || (item.def !== undefined && kind !== "definition")) return;
    this.scheduleSource(() => this.navigation.load(item.def ?? item.ref, kind));
  }
  reloadSource(): void {
    this.scheduleSource(() => this.navigation.reloadDocument());
  }
  cancelSource(): void {
    this.scheduleSource(() => this.navigation.cancelDocument());
  }

  private scheduleSource(begin: () => Promise<void>): void {
    const context = { generation: this.generation, sourceGeneration: ++this.sourceGeneration };
    this.sourceContext = undefined;
    this.afterNotification(
      context.generation,
      () => this.sourceCommand(context, begin),
      context.sourceGeneration,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.sourceContext = undefined;
    this.lookup?.abort();
    const errors: unknown[] = [];
    for (const off of this.subscriptions) {
      try {
        off();
      } catch (error) {
        errors.push(error);
      }
    }
    for (const model of [
      this.designGraph,
      this.tree,
      this.properties,
      this.connections,
      this.navigation,
      this.search,
      this.instances,
      this.resolution,
      this.selection,
    ]) {
      try {
        model.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    // The renderer session owns the SDK; panels only borrow it.
    if (errors.length) throw new AggregateError(errors, "Design panels cleanup failed");
  }
}
