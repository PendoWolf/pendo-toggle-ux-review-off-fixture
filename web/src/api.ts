// API base URL. Defaults to the local server; override via VITE_API_URL for
// deployed/preview environments (QAWolf runs against whatever URL this points at).
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface AppState {
  counter: number;
  lastAction: string;
}

type Method = "GET" | "POST";

// Thrown by call() with the request details, so failures can be reported per
// endpoint (demo-action-failed in App.tsx). status is undefined when no response
// arrived (network or CORS failure); the original error is kept as the cause.
export class ApiError extends Error {
  readonly method: Method;
  readonly path: string;
  readonly status?: number;

  constructor(
    message: string,
    details: { method: Method; path: string; status?: number },
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApiError";
    this.method = details.method;
    this.path = details.path;
    this.status = details.status;
  }
}

async function call(path: string, method: Method): Promise<AppState> {
  const res = await fetch(`${BASE}${path}`, { method }).catch((e: Error) => {
    // Network or CORS failure: keep the browser's message, which the UI shows.
    throw new ApiError(e.message, { method, path }, { cause: e });
  });
  if (!res.ok) throw new ApiError(`${method} ${path} failed: ${res.status}`, { method, path, status: res.status });
  return res.json() as Promise<AppState>;
}

export const api = {
  getState: () => call("/api/state", "GET"),
  increment: () => call("/api/increment", "POST"),
  decrement: () => call("/api/decrement", "POST"),
  reset: () => call("/api/reset", "POST"),
};
