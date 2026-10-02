let unavailable = false;
export const connectionChanged = "meshek48:connection";
export function markConnection(connected: boolean) {
  unavailable = !connected;
  window.dispatchEvent(new Event(connectionChanged));
}
export function isDisconnected() { return !navigator.onLine || unavailable; }
export function subscribeConnection(callback: () => void) {
  const online = () => { unavailable = false; callback(); };
  window.addEventListener("online", online);
  window.addEventListener("offline", callback);
  window.addEventListener(connectionChanged, callback);
  return () => { window.removeEventListener("online", online); window.removeEventListener("offline", callback); window.removeEventListener(connectionChanged, callback); };
}
