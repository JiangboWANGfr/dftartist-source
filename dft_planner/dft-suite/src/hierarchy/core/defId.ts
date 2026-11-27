// Pure helpers for the synthesized definition id `${designName}|${absFilePath}`.

/** definitionId encodes `${designName}|${absFilePath}` -> derive name+path with no round-trip. */
export function splitDefId(defId: string): { designName: string; filePath: string } {
  const i = defId.indexOf("|");
  return i < 0
    ? { designName: defId, filePath: "" }
    : { designName: defId.slice(0, i), filePath: defId.slice(i + 1) };
}
