type HistoryGuard = (event: PopStateEvent) => void;
let current: HistoryGuard | null = null;

/** A callback only, never another draft/scene store. Late cleanup cannot remove a newer guard. */
export function registerLocalHistoryGuard(guard: HistoryGuard) {
  current = guard;
  return () => { if (current === guard) current = null; };
}

/** Install before the router's passive effect; Window target listeners run in registration order. */
export function installLocalHistoryGuard() {
  const navigate = (event: PopStateEvent) => current?.(event);
  window.addEventListener("popstate", navigate);
  return () => window.removeEventListener("popstate", navigate);
}
