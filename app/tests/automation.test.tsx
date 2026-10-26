import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSteps, runSteps } from "../src/automation.ts";
import { receiveOutput, captureFor } from "../src/terminal-tools.ts";
import type { Session } from "../src/types.ts";
test("scenario validates operations and limits", () => {
  assert.throws(() => parseSteps('[{"wait":-1}]'));
  assert.throws(() => parseSteps('[{"exec":"rm"}]'));
  assert.throws(() => parseSteps('[{"expect":""}]'));
  assert.throws(() => parseSteps('[{"send":"a","wait":1}]'));
  assert.equal(parseSteps('[{"send":"echo hi\\n"}]').length, 1);
});
test("expect sees immediate output after send but not stale output, cancellation stops", async () => {
  let sent = 0;
  const s = {
    status: "connected",
    closed: false,
    inputQueue: Promise.resolve(),
    terminal: {
      paste: () => {
        sent++;
        receiveOutput(s, new TextEncoder().encode("ready"));
      },
    },
  } as unknown as Session;
  const signal = new AbortController();
  await runSteps(
    s,
    [{ send: "echo ready\n" }, { expect: "ready" }],
    signal.signal,
    () => {},
  );
  assert.equal(sent, 1);
  await assert.rejects(
    runSteps(s, [{ expect: "ready", timeout: 1 }], signal.signal, () => {}),
    /시간 초과/,
  );
  signal.abort();
  await assert.rejects(
    runSteps(s, [{ send: "again" }], signal.signal, () => {}),
    /중지/,
  );
  assert.equal(sent, 1);
  assert.equal(captureFor(s).recording, false);
});
test("a failed send aborts following steps", async () => {
  let sends = 0;
  const s = {
    status: "connected",
    closed: false,
    inputQueue: Promise.resolve(),
    terminal: {
      paste: () => {
        sends++;
        s.inputFailures = (s.inputFailures || 0) + 1;
      },
    },
  } as unknown as Session;
  await assert.rejects(
    runSteps(
      s,
      [{ send: "first" }, { send: "second" }],
      new AbortController().signal,
      () => {},
    ),
    /전송 실패/,
  );
  assert.equal(sends, 1);
});

test('scenario size limit counts UTF8 bytes', () => {
  assert.throws(() => parseSteps(JSON.stringify([{send:'가'.repeat(22000)}])), /64 KiB/);
});
