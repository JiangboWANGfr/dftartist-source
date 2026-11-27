// Known consumers, NOT SourceCandidatesView behavior or a general Q1 oracle.
export const cases = Object.freeze(
  [
    {
      id: "B48-P01",
      command: "loadMore",
      mode: "direct-dual",
      shape: [1, 1, 0, 0],
    },
    {
      id: "B48-P02",
      command: "reloadCandidates",
      mode: "native-await",
      shape: [1, 1, 0, 0],
    },
    {
      id: "B48-P03",
      command: "loadMore",
      mode: "empty-forward",
      shape: [1, 0, 0, 1],
    },
    {
      id: "B48-P04",
      command: "reloadCandidates",
      mode: "microtask-late",
      shape: [0, 0, 0, 0],
    },
    {
      id: "B48-P05",
      command: "loadMore",
      mode: "unmount-direct",
      shape: [1, 1, 0, 0],
    },
    {
      id: "B48-P06",
      command: "loadMore",
      mode: "unmount-skip",
      shape: [0, 0, 0, 0],
    },
    {
      id: "B48-P07",
      command: "loadMore",
      mode: "success-only",
      shape: [1, 0, 1, 0],
    },
  ].map(Object.freeze),
);
export const shape = (d) => [d.newReactions, d.dual, d.single, d.empty];
// Transport sees SDK-normalized defaults (DESIGN 5.6.3/5.6.6), not raw L6 options.
export function wireCursor(command, next) {
  if (command === "loadMore") return next;
  if (command === "reloadCandidates") return "";
  throw TypeError("unknown bridge command");
}
