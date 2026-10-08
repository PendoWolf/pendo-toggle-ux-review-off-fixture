import { useEffect, useState } from "react";
import { api, ApiError, type AppState } from "./api";

type Action = "load" | "increment" | "decrement" | "reset" | "refresh";

// Pendo Track Event property values: strings, numbers or booleans.
type TrackProps = Record<string, string | number | boolean>;

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
// Event names are `demo-${name}` (demo-increment, demo-action-failed, ...) and
// must match the track types registered in Pendo exactly, so don't rename them.
function trackEvent(name: Action | "action-failed", props: TrackProps) {
  if (typeof window !== "undefined") {
    try {
      window.pendo?.track?.(`demo-${name}`, props);
    } catch {
      // Never let analytics break the app (or surface as a failed action in run()).
    }
  }
}

// Properties sent with each action's success event. `next` is the state the API
// returned; `previous` is the state on screen when the action was triggered.
const successProps: Record<Action, (next: AppState, previous: AppState) => TrackProps> = {
  load: (next) => ({ counter: next.counter, lastAction: next.lastAction }),
  increment: (next, previous) => ({ counter: next.counter, previousCounter: previous.counter }),
  decrement: (next, previous) => ({ counter: next.counter, previousCounter: previous.counter }),
  // The counter is always 0 after a reset, so the useful value is the one discarded.
  reset: (_next, previous) => ({ previousCounter: previous.counter }),
  refresh: (next, previous) => ({
    counter: next.counter,
    previousCounter: previous.counter,
    counterChanged: next.counter !== previous.counter,
  }),
};

// Report the initial load once per page load: React StrictMode runs mount
// effects twice in development, so only the first run reports to Pendo.
let initialLoadStarted = false;

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);

  // Runs a counter action, then reports it to Pendo: demo-<name> on success,
  // demo-action-failed on error. `track` is false only for the duplicate
  // initial load StrictMode triggers in development.
  const run = async (name: Action, fn: () => Promise<AppState>, track = true) => {
    const previous = state;
    try {
      setError(null);
      const next = await fn();
      setState(next);
      if (track) trackEvent(name, successProps[name](next, previous));
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      if (track) {
        trackEvent("action-failed", {
          action: name,
          // Truncated to keep the event well under Pendo's 512-byte property limit.
          errorMessage: message.slice(0, 100),
          // Set only if the API responded; absent when the request itself failed.
          ...(e instanceof ApiError && { httpStatus: e.status }),
        });
      }
    }
  };

  useEffect(() => {
    run("load", api.getState, !initialLoadStarted);
    initialLoadStarted = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
      <h1>QAWolf Demo</h1>

      <p data-testid="counter-value" style={{ fontSize: "3rem", margin: "1rem 0" }}>
        {state.counter}
      </p>
      <p data-testid="last-action" style={{ color: "#666" }}>
        Last action: {state.lastAction}
      </p>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <button data-testid="btn-increment" onClick={() => run("increment", api.increment)}>
          Increment
        </button>
        <button data-testid="btn-decrement" onClick={() => run("decrement", api.decrement)}>
          Decrement
        </button>
        <button data-testid="btn-reset" onClick={() => run("reset", api.reset)}>
          Reset
        </button>
        <button data-testid="btn-refresh" onClick={() => run("refresh", api.getState)}>
          Refresh
        </button>
      </div>

      {error && (
        <p data-testid="error" style={{ color: "crimson", marginTop: 16 }}>
          {error}
        </p>
      )}
    </main>
  );
}
