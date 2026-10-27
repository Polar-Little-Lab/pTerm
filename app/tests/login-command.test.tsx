import { test } from "node:test";
import assert from "node:assert/strict";
import { configureSession, runLoginCommand } from "../src/session-runtime";
import type { Session, Workspace } from "../src/types";
import { defaults } from "../src/session-preferences";
const session = () =>
  ({
    id: "s",
    kind: "ssh",
    host: { id: "h", group: "prod" },
    status: "connected",
    closed: false,
    inputQueue: Promise.resolve(),
    queuedInputBytes: 0,
    terminal: { options: {} },
    preferences: {
      ...defaults,
      startupEnabled: true,
      startupCommand: "echo ready\n",
    },
  }) as unknown as Session;
test("startup command waits for prior input, adds Enter and runs only once per SSH connection", async () => {
  const s = session(),
    sent: string[] = [];
  let release!: () => void;
  s.inputQueue = new Promise((r) => (release = r));
  const send = async (bytes: number[]) => {
    sent.push(new TextDecoder().decode(new Uint8Array(bytes)));
  };
  const started = runLoginCommand(s, send);
  await runLoginCommand(s, send);
  assert.deepEqual(sent, []);
  release();
  await started;
  assert.deepEqual(sent, ["echo ready\r"]);
  assert.equal(s.queuedInputBytes, 0);
});
test("startup command never runs on external engines or closed sessions and surfaces failure", async () => {
  const s = session();
  s.kind = "local";
  let sent = 0;
  await runLoginCommand(s, async () => {
    sent++;
  });
  assert.equal(sent, 0);
  s.kind = "ssh";
  s.closed = true;
  await assert.rejects(
    runLoginCommand(s, async () => {
      sent++;
    }),
    /취소/,
  );
  assert.equal(sent, 0);
  const other = session();
  await assert.rejects(
    runLoginCommand(other, async () => {
      throw Error("write failed");
    }),
    /write failed/,
  );
  assert.equal(other.inputFailures, 1);
  assert.equal(other.queuedInputBytes, 0);
});
test("session configuration applies inherited terminal options before connection", () => {
  const s = session();
  const w = {
    version: 1,
    hosts: [],
    snippets: [],
    sessionDefaults: { fontSize: 14 },
    groupPreferences: { prod: { fontSize: 17, closeProtected: true } },
  } as Workspace;
  configureSession(s, w, () => {});
  assert.equal(s.terminal.options.fontSize, 17);
  assert.equal(s.closeProtected, true);
  assert.equal(s.preferences?.fontSize, 17);
});
