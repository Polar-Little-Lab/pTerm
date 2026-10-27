import { test } from "node:test";
import assert from "node:assert/strict";
import {
  captureFor,
  receiveOutput,
  type Trigger,
} from "../src/terminal-tools.ts";
import type { Session } from "../src/types";
const encode = (s: string) => new TextEncoder().encode(s);
const tick = () => new Promise((r) => setTimeout(r, 0));
function fixture() {
  const sent: string[] = [];
  const s = {
    status: "connected",
    closed: false,
    inputQueue: Promise.resolve(),
    terminal: {
      input: (text: string) => {
        sent.push(text);
        receiveOutput(s as Session, encode("READY"));
      },
    },
  } as unknown as Session;
  const rule: Trigger = {
    id: "r",
    pattern: "READY",
    message: "ready",
    enabled: true,
    action: "send",
    command: "echo next\r",
    maxRuns: 1,
    cooldownMs: 1000,
  };
  captureFor(s).triggers = [rule];
  return { s, sent, rule, state: captureFor(s) };
}
test("automatic trigger spans chunks and sends once even when its own output matches", async () => {
  const { s, sent, rule, state } = fixture();
  receiveOutput(s, encode("RE"));
  receiveOutput(s, encode("ADY"));
  receiveOutput(s, encode("READY"));
  await tick();
  assert.deepEqual(sent, ["echo next\r"]);
  state.last.clear();
  receiveOutput(s, encode("READY"));
  await tick();
  assert.equal(sent.length, 1);
  assert.equal(rule.runs, 1);
});
test("disabling, removing or closing before queued command prevents transmission", async () => {
  for (const action of ["disable", "remove", "close"]) {
    const { s, sent, rule, state } = fixture();
    receiveOutput(s, encode("READY"));
    if (action === "disable") rule.enabled = false;
    if (action === "remove") state.triggers = [];
    if (action === "close") s.closed = true;
    await tick();
    assert.deepEqual(sent, []);
  }
});
test("failed input disables the rule; rearm is explicit", async () => {
  const { s, rule, state } = fixture();
  s.terminal.input = () => {
    s.inputFailures = (s.inputFailures || 0) + 1;
  };
  receiveOutput(s, encode("READY"));
  await tick();
  assert.equal(rule.enabled, false);
  assert.match(state.alerts.join("\n"), /입력 전송 실패/);
  assert.equal(rule.runs, 1);
});
test("cooldown applies between allowed runs and oversized commands never send", async () => {
  const { s, sent, rule, state } = fixture();
  rule.maxRuns = 2;
  receiveOutput(s, encode("READY"));
  await tick();
  receiveOutput(s, encode("READY"));
  await tick();
  assert.equal(sent.length, 1);
  state.last.set(rule.id, Date.now() - 2000);
  receiveOutput(s, encode("READY"));
  await tick();
  assert.equal(sent.length, 2);
  rule.runs = 0;
  state.last.clear();
  rule.command = "가".repeat(6000);
  receiveOutput(s, encode("READY"));
  await tick();
  assert.equal(sent.length, 2);
  assert.equal(rule.enabled, false);
});
