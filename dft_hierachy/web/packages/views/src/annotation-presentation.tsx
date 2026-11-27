import type { ReactElement } from "react";
import type { ResolvedObjectAnnotation } from "@hier/viewmodel";

type Matches = readonly ResolvedObjectAnnotation[];
const badge = ({ layer, entry }: ResolvedObjectAnnotation): string =>
  entry.mark.badge ?? entry.mark.severity ?? layer.label;
function describe(value: ResolvedObjectAnnotation): string {
  const {
    layer,
    entry: { ref, mark },
  } = value;
  return [
    `标注 ${layer.label} [${layer.id}]`,
    `对象 ${ref}`,
    `标记 ${badge(value)}`,
    ...(mark.severity === undefined ? [] : [`级别 ${mark.severity}`]),
    ...(mark.color === undefined ? [] : [`颜色 ${mark.color}`]),
    ...(mark.tooltip === undefined ? [] : [`说明 ${mark.tooltip}`]),
  ].join(" · ");
}
export function annotationDescription(matches: Matches): string | undefined {
  return matches.length ? matches.map(describe).join("\n") : undefined;
}

/** Description strings belong only to this render's immutable resolved lists. */
export function createAnnotationDescriptions(): (matches: Matches) => string | undefined {
  const descriptions = new Map<Matches, string | undefined>();
  return (matches) => {
    if (!descriptions.has(matches)) descriptions.set(matches, annotationDescription(matches));
    return descriptions.get(matches);
  };
}

export function AnnotationBadges({ matches }: { matches: Matches }): ReactElement | null {
  if (!matches.length) return null;
  return (
    <span className="hier-hierarchy-tree__annotations" aria-hidden="true">
      {matches.map((match, index) => (
        <span key={index} className="hier-hierarchy-tree__annotation">
          {match.entry.mark.color !== undefined && (
            <span
              className="hier-hierarchy-tree__annotation-color"
              style={{ backgroundColor: match.entry.mark.color }}
            />
          )}
          {badge(match)}
        </span>
      ))}
    </span>
  );
}

/** A clipped overlay uses existing geometry; it never changes layout input sizes. */
export function GraphAnnotations({
  matches,
  x,
  y,
  width,
}: {
  matches: Matches;
  x: number;
  y: number;
  width: number;
}): ReactElement | null {
  if (!matches.length) return null;
  return (
    <svg
      x={x}
      y={y}
      width={Math.max(1, width)}
      height={18}
      className="hier-schematic-view__annotations"
      aria-hidden="true"
    >
      {matches.map((match, index) => (
        <g key={index} transform={`translate(${index * 100} 0)`}>
          {match.entry.mark.color !== undefined && (
            <rect x={0} y={4} width={8} height={8} style={{ fill: match.entry.mark.color }} />
          )}
          <text x={match.entry.mark.color === undefined ? 0 : 12} y={13}>
            {badge(match)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function AnnotationDetails({ matches }: { matches: Matches }): ReactElement | null {
  if (!matches.length) return null;
  return (
    <article className="hier-schematic-view__annotation-details">
      <h3>对象标注</h3>
      <ol>
        {matches.map((match, index) => (
          <li key={index}>{describe(match)}</li>
        ))}
      </ol>
    </article>
  );
}
