import type { InstanceTreeRow, RowId, TreePageState, TreeRow } from "@hier/viewmodel";

interface PresentedTreeRow {
  readonly row: TreeRow;
  readonly index: number;
  readonly position: number;
  readonly page: TreePageState;
}

/** Derived ARIA metadata only; original rows and model page objects are retained. */
export function projectTreeRows(rows: readonly TreeRow[], root: TreePageState) {
  const indices = new Map<RowId, number>();
  const counts = new Map<RowId | null, number>();
  const positions = new Uint32Array(rows.length);
  // One-based instance indices, with zero for the roots page. Every owner
  // precedes its child, so indices and positions fit the JS Array length range.
  const pageOwners = new Uint32Array(rows.length);
  for (let index = 0; index < rows.length; ++index) {
    const row = rows[index]!;
    if (row.parentId !== null) {
      const parentIndex = indices.get(row.parentId)!;
      pageOwners[index] = rows[parentIndex]!.kind === "instance"
        ? parentIndex + 1 : pageOwners[parentIndex]!;
    }
    const position = (counts.get(row.parentId) ?? 0) + 1;
    counts.set(row.parentId, position);
    positions[index] = position;
    indices.set(row.id, index);
  }
  return {
    byId: {
      size: indices.size,
      has: (id: RowId) => indices.has(id),
      // Only virtual rows and navigation targets need a presentation object.
      // Capture this projection's rows/root; retained lookups never read a
      // later model snapshot or share mutable context with another projection.
      get(id: RowId): PresentedTreeRow | undefined {
        const index = indices.get(id);
        if (index === undefined) return undefined;
        const owner = pageOwners[index]!;
        return {
          row: rows[index]!,
          index,
          position: positions[index]!,
          page: owner === 0 ? root : (rows[owner - 1] as InstanceTreeRow).children,
        };
      },
    },
    counts,
  };
}
