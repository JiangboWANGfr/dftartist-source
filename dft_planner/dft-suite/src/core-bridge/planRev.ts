// Every dp_shell call reports the session's plan revision — from here, not from each caller.
//
// The console reported it and the schematic's own context menu did not, so a mux recorded by
// right-clicking a net changed the plan without anything on screen noticing: it appeared after a
// reload and not before. Any number of screens run dp_shell commands (the schematic menus, the
// clock/reset page, the DFX IP tab, the console), and asking each one to remember to report is a
// rule that will be broken again the next time a command is added somewhere new.
//
// So the CLIENT reports it, once, for every call. This module is the seam: core-bridge must not
// import a UI store, and the store must not wrap every call site.

type Sink = (rev: number | undefined) => void;

let sink: Sink | null = null;

/** Installed once by the store at start-up. */
export function setPlanRevSink(f: Sink): void { sink = f; }

/** Called by the dp_shell client on every reply. */
export function reportPlanRev(rev: number | undefined): void {
  if (rev !== undefined) sink?.(rev);
}
