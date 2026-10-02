import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceReconnect } from "../src/lib/workspace-reconnect.ts";
import { localDateInputValue, outsideDialog } from "../src/lib/dialog-dismiss.ts";

test("reconnection preserves an open receipt editor and restores the same page after closing", async () => {
  let editorOpen = true, requests = 0, restored = 0, connected = 0;
  const controller = createWorkspaceReconnect({
    online: () => true, visible: () => true, editorOpen: () => editorOpen,
    request: async () => { requests++; return { ok: true, status: 200 }; },
    connected: () => { connected++; }, restore: () => { restored++; }, signIn: () => assert.fail("unexpected sign-in"),
  });
  await controller.reconnect();
  assert.equal(connected, 0);
  assert.equal(restored, 0);
  editorOpen = false;
  await controller.reconnect();
  assert.equal(requests, 2);
  assert.equal(connected, 1);
  assert.equal(restored, 1);
});

test("opening a dialog during the connection check and auth expiry both defer navigation", async () => {
  let editorOpen = false, status = 200, restored = 0, signIns = 0;
  let respond!: (value: { ok: boolean; status: number }) => void;
  const controller = createWorkspaceReconnect({
    online: () => true, visible: () => true, editorOpen: () => editorOpen,
    request: () => new Promise((resolve) => { respond = resolve; }),
    connected: () => {}, restore: () => { restored++; }, signIn: () => { signIns++; },
  });
  const checking = controller.reconnect();
  editorOpen = true;
  respond({ ok: true, status });
  await checking;
  assert.equal(restored, 0);
  status = 401;
  const expired = controller.reconnect();
  respond({ ok: false, status });
  await expired;
  assert.equal(signIns, 0);
  editorOpen = false;
  const closed = controller.reconnect();
  respond({ ok: false, status });
  await closed;
  assert.equal(signIns, 1);
});

test("foreground checks avoid duplicate requests and ignore responses after unmount", async () => {
  let visible = false, requests = 0, restored = 0;
  let respond!: (value: { ok: boolean; status: number }) => void;
  const controller = createWorkspaceReconnect({
    online: () => true, visible: () => visible, editorOpen: () => false,
    request: () => { requests++; return new Promise((resolve) => { respond = resolve; }); },
    connected: () => {}, restore: () => { restored++; }, signIn: () => {},
  });
  await controller.reconnect();
  assert.equal(requests, 0);
  visible = true;
  const active = controller.reconnect();
  await controller.reconnect();
  assert.equal(requests, 1);
  controller.dispose();
  respond({ ok: true, status: 200 });
  await active;
  assert.equal(restored, 0);
});

test("dialog padding stays inside the editor and date inputs use the local calendar day", () => {
  const bounds = { left: 0, right: 390, top: 50, bottom: 800 };
  assert.equal(outsideDialog(bounds, 12, 65), false);
  assert.equal(outsideDialog(bounds, 30, 49), true);
  assert.equal(outsideDialog(bounds, 391, 300), true);
  assert.equal(localDateInputValue(new Date(2026, 0, 2, 0, 15)), "2026-01-02");
  assert.equal(localDateInputValue(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
});
