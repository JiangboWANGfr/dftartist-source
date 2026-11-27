/** Internal access to the existing task records; not a second query state. */
export interface QueryCommand {
  readonly promise: Promise<void>;
  readonly errors: unknown[];
  readonly failure: unknown;
  readonly settled: boolean;
}

export interface QueryScope {
  readonly busy: boolean;
  /** The command currently publishing or preparing its failure diagnostic. */
  readonly current: QueryCommand | undefined;
  /** No-op and entry rejection promises need not own a task record. */
  command(promise: Promise<void>): QueryCommand | undefined;
}

const scopes = new WeakMap<object, QueryScope>();

export function registerQueryScope(owner: object, scope: QueryScope): void {
  scopes.set(owner, scope);
}

export function getQueryScope(owner: object): QueryScope {
  const scope = scopes.get(owner);
  if (scope === undefined) throw new Error("Query owner has no internal scope");
  return scope;
}

/** Public model wrappers retain their existing constructors and declarations. */
export function registerQueryOwner(owner: object, queryModel: object): void {
  registerQueryScope(owner, getQueryScope(queryModel));
}
