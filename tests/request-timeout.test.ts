import assert from "node:assert/strict";
import test from "node:test";
import { withRequestTimeout } from "../src/lib/request-timeout.ts";

test("requests work without AbortSignal.timeout on older Safari", async () => {
  const nativeTimeout = AbortSignal.timeout;
  Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: undefined });
  try {
    assert.equal(await withRequestTimeout(async (signal) => {
      assert.equal(signal.aborted, false);
      return "finished";
    }, 100), "finished");
  } finally { Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: nativeTimeout }); }
});

test("a deadline also cancels stalled response-body reading", async () => {
  await assert.rejects(withRequestTimeout(async (signal) => {
    const response = new Response(new ReadableStream({ start(controller) {
      signal.addEventListener("abort", () => controller.error(new DOMException("Timed out", "AbortError")), { once: true });
    } }));
    return response.text();
  }, 5), { name: "AbortError" });
});

test("successful and rejected requests release their timers", async () => {
  let signal: AbortSignal | undefined;
  await withRequestTimeout(async (current) => { signal = current; }, 5);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(signal?.aborted, false);
  await assert.rejects(withRequestTimeout(async (current) => { signal = current; throw new Error("failed"); }, 5), /failed/);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(signal?.aborted, false);
});
