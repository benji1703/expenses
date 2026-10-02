type ReconnectEnvironment = {
  online: () => boolean;
  visible: () => boolean;
  editorOpen: () => boolean;
  request: () => Promise<{ ok: boolean; status: number }>;
  connected: () => void;
  restore: () => void;
  signIn: () => void;
};

// Reconnection must never discard the editor that was opened in the cached shell.
// Check again after the request: the user may start editing while it is in flight.
export function createWorkspaceReconnect(environment: ReconnectEnvironment) {
  let busy = false;
  let disposed = false;
  async function reconnect() {
    if (disposed || busy || !environment.online() || !environment.visible()) return;
    busy = true;
    try {
      const response = await environment.request();
      if (disposed) return;
      if (environment.editorOpen()) return;
      if (response.ok) { environment.connected(); environment.restore(); }
      else if (response.status === 401) environment.signIn();
    } catch { /* Keep the local workspace available until the server responds. */ }
    finally { busy = false; }
  }
  return { reconnect, dispose: () => { disposed = true; } };
}
