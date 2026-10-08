import { useEffect, useState } from "react";
import { api, ApiError, type AppState } from "./api";

type Action = "load" | "increment" | "decrement" | "reset" | "refresh";

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
// Emits demo-<action> on success and demo-action-failed when an action's API
// call fails. Pendo matches these names exactly, so don't rename them.
function trackEvent(name: Action | "action-failed", props: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    try {
      window.pendo?.track?.(`demo-${name}`, props);
    } catch {
      // Tracking must never break the app or be reported as a failed action.
    }
  }
}

// Properties for each demo-<action> success event. `prev` is the state that was
// on screen when the action started and `next` is what the server returned. The
// server counter is shared by all clients, so `prev` may be stale.
function successProps(action: Action, prev: AppState, next: AppState): Record<string, unknown> {
  switch (action) {
    case "load":
      return { counter: next.counter, lastAction: next.lastAction };
    case "increment":
    case "decrement":
      return { counter: next.counter, previousCounter: prev.counter };
    case "reset":
      // The new counter is always 0, so only the discarded value is useful.
      return { previousCounter: prev.counter };
    case "refresh":
      return {
        counter: next.counter,
        previousCounter: prev.counter,
        counterChanged: next.counter !== prev.counter,
        lastAction: next.lastAction,
      };
  }
}

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);

  // `state` is this render's snapshot: what was on screen when the action started.
  const run = async (name: Action, fn: () => Promise<AppState>) => {
    try {
      setError(null);
      const next = await fn();
      setState(next);
      trackEvent(name, successProps(name, state, next));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      trackEvent("action-failed", {
        action: name,
        // Truncated to keep the payload under Pendo's 512-byte property limit.
        errorMessage: message.slice(0, 100),
        // Only non-2xx responses carry a status; network errors leave it undefined.
        httpStatus: e instanceof ApiError ? e.status : undefined,
        counter: state.counter,
      });
    }
  };

  // React StrictMode runs this effect twice in development, so demo-load fires
  // twice there; production builds fire it once.
  useEffect(() => {
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
