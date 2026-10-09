import { useEffect, useState } from "react";
import { api, ApiError, type AppState } from "./api";

type Action = "load" | "increment" | "decrement" | "reset" | "refresh";

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
// Sent as `demo-${name}`, which must match the track type names in Pendo.
function trackEvent(name: Action | "action-failed", props?: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    window.pendo?.track?.(`demo-${name}`, props);
  }
}

// Properties sent with each action's success event. The server keeps one counter
// shared by all visitors, so previousCounter (the value on screen before the
// action) also reveals changes someone else made in the meantime.
function successProps(action: Action, next: AppState, previousCounter: number): Record<string, unknown> {
  switch (action) {
    case "load":
      // Nothing was on screen yet, so report the state the visitor found.
      return { counter: next.counter, lastAction: next.lastAction };
    case "increment":
    case "decrement":
      return { counter: next.counter, previousCounter };
    case "reset":
      // The counter is always 0 after a reset; what matters is the value cleared.
      return { previousCounter };
    case "refresh":
      return { counter: next.counter, previousCounter, lastAction: next.lastAction };
  }
}

// Properties for demo-action-failed. method, path and status come from ApiError;
// status is missing when no response arrived (network or CORS failure).
function failureProps(action: Action, e: unknown): Record<string, unknown> {
  const props: Record<string, unknown> = {
    action,
    // Truncated to stay well within Pendo's size limit for event properties.
    errorMessage: (e instanceof Error ? e.message : String(e)).slice(0, 100),
  };
  if (e instanceof ApiError) {
    props.method = e.method;
    props.path = e.path;
    if (e.status !== undefined) props.status = e.status;
  }
  return props;
}

// Module-level so the initial load runs, and is tracked, once per page load,
// even though React StrictMode runs mount effects twice in development.
let initialLoadStarted = false;

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);

  const run = async (action: Action, fn: () => Promise<AppState>) => {
    const previousCounter = state.counter;
    try {
      setError(null);
      const next = await fn();
      setState(next);
      trackEvent(action, successProps(action, next, previousCounter));
    } catch (e) {
      setError((e as Error).message);
      trackEvent("action-failed", failureProps(action, e));
    }
  };

  useEffect(() => {
    if (initialLoadStarted) return;
    initialLoadStarted = true;
    run("load", api.getState);
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
