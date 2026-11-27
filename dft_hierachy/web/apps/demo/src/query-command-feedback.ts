interface QueryModel {
  readonly state: { readonly status: string };
  subscribe(listener: () => void): () => void;
}

/** Host report eligibility only; the borrowed model owns every query and its state. */
export class QueryCommandFeedback {
  private operation: { starting: boolean } | undefined;
  private disposed = false;
  private readonly unsubscribe: () => void;

  constructor(
    model: QueryModel,
    private readonly consume: (command: Promise<void>, current: () => boolean) => void,
  ) {
    this.unsubscribe = model.subscribe(() => {
      if (this.operation?.starting) return;
      const { status } = model.state;
      // A new model command, explicit cancel or clear supersedes the host waiter.
      // Its own success/failed publication must leave that waiter eligible.
      if (status === "pending" || status === "cancelled" || status === "idle")
        this.operation = undefined;
    });
  }

  run(begin: () => Promise<void>): Promise<void> {
    const operation = { starting: true };
    if (!this.disposed) this.operation = operation;
    let command: Promise<void>;
    try {
      command = begin();
    } catch (error) {
      command = Promise.reject(error);
    } finally {
      operation.starting = false;
    }
    this.consume(command, () => !this.disposed && this.operation === operation);
    return command;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.operation = undefined;
    this.unsubscribe();
  }
}
