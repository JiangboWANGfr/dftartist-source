// Explicit facilities-only counterexample. NEVER the production candidate UI.
// It uses real public models and differs only by the injected revoked-path leak.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
export function SourceCandidatesView({
  navigation,
  selection,
  onCommandError,
}) {
  const current = useRef(onCommandError);
  const [actions, setActions] = useState([]);
  const [renderError, setRenderError] = useState(null);
  useLayoutEffect(() => {
    current.current = onCommandError;
  }, [onCommandError]);
  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      const page = navigation.state.candidates.state.pages[0];
      setActions(
        page.result.items.map((_, i) =>
          navigation.createCandidateAction(page, i),
        ),
      );
    });
    return () => {
      live = false;
    };
  }, [navigation, selection]);
  if (renderError) {
    window.B98Wrapper = renderError;
    if (B98_BOUNDARY_LEAK)
      queueMicrotask(() => {
        window.B98LateLeaks = (window.B98LateLeaks ?? 0) + 1;
        throw renderError; // Deliberate later SAME-object escape after React render.
      });
    throw renderError;
  }
  function confirm(action) {
    try {
      navigation.confirmCandidate(action, selection);
    } catch (error) {
      window.B98OriginalE = error; // Control-owned identity witness, not product instrumentation.
      const callback = onCommandError;
      queueMicrotask(() => {
        if (current.current !== callback) {
          if (B98_LEAK) throw error; // Deliberate C98 negative.
          return; // Zero-error positive, all other inputs identical.
        }
        try {
          callback(Object.freeze({ command: "confirm", action, error }));
        } catch (x) {
          setRenderError(new AggregateError([error, x]));
        }
      });
    }
  }
  return (
    <ul>
      {actions.map((action, i) => (
        <li key={i}>
          <button onClick={() => confirm(action)}>B98 control row {i}</button>
        </li>
      ))}
    </ul>
  );
}
