import { test } from "node:test";
import assert from "node:assert/strict";
import { FileLog, type LogIO } from "../src/file-log.ts";
const info = {
  directory: "/logs/run",
  path: "/logs/run/1.log",
  bytes: 0,
  rotations: 0,
};
const options = { directory: "/logs", maxMiB: 1, files: 2 };
test("file log buffers opening output, preserves bytes and flushes before closing once", async () => {
  let ready!: (value: typeof info) => void;
  const start = new Promise<typeof info>((r) => (ready = r));
  const events: string[] = [];
  const recorded: number[] = [];
  const io: LogIO = {
    start: async () => start,
    append: async (_, bytes) => {
      events.push("write");
      recorded.push(...bytes);
      return { ...info, bytes: recorded.length };
    },
    stop: async () => {
      events.push("close");
    },
  };
  const log = new FileLog("id", options, io);
  log.write(new Uint8Array([0, 255, 1]));
  log.write(new Uint8Array([2, 3]));
  const stopped = log.stop();
  const stoppedAgain = log.stop();
  assert.deepEqual(events, []);
  ready(info);
  await Promise.all([stopped, stoppedAgain]);
  assert.deepEqual(recorded, [0, 255, 1, 2, 3]);
  assert.deepEqual(events, ["write", "close"]);
  assert.equal(log.status, "stopped");
  log.write(new Uint8Array([4]));
  assert.equal(recorded.length, 5);
});
test("write errors stop capturing and close the native file", async () => {
  const errors: string[] = [];
  let closed = 0;
  const io: LogIO = {
    start: async () => info,
    append: async () => {
      throw new Error("disk full");
    },
    stop: async () => {
      closed++;
    },
  };
  const log = new FileLog("id", options, io, (e) => errors.push(e));
  log.write(new Uint8Array([1]));
  await log.stop();
  assert.match(log.error, /disk full/);
  assert.equal(log.status, "error");
  assert.equal(closed, 1);
  assert.equal(errors.length, 1);
});
test("bounded queue rejects overflow while start is pending", async () => {
  let ready!: (value: typeof info) => void;
  let count = 0;
  const io: LogIO = {
    start: () => new Promise((r) => (ready = r)),
    append: async () => {
      count++;
      return info;
    },
    stop: async () => {},
  };
  const log = new FileLog("id", options, io);
  log.write(new Uint8Array(4 * 1024 * 1024 + 1));
  ready(info);
  await log.stop();
  assert.match(log.error, /4 MiB/);
  assert.equal(count, 0);
});
test("large chunks are bounded for native IPC and ordering is preserved", async () => {
  const chunks: number[][] = [];
  const io: LogIO = {
    start: async () => info,
    append: async (_, bytes) => {
      chunks.push(bytes);
      return info;
    },
    stop: async () => {},
  };
  const log = new FileLog("id", options, io);
  const bytes = Uint8Array.from({ length: 150000 }, (_, i) => i % 256);
  log.write(bytes);
  await log.stop();
  assert.ok(chunks.every((c) => c.length <= 65536));
  assert.deepEqual(Uint8Array.from(chunks.flat()), bytes);
});
test("start failure resolves shutdown without sending writes or close for unknown id", async () => {
  const io: LogIO = {
    start: async () => {
      throw Error("permission denied");
    },
    append: async () => {
      throw Error("unexpected");
    },
    stop: async () => {
      throw Error("unexpected");
    },
  };
  const log = new FileLog("id", options, io);
  await log.stop();
  assert.match(log.error, /permission denied/);
  assert.equal(log.status, "error");
});
test("repeated shutdown while native close is pending closes exactly once", async () => {
  let release!: () => void;
  let closed = 0;
  const io: LogIO = {
    start: async () => info,
    append: async () => info,
    stop: () => {
      closed++;
      return new Promise((r) => (release = r));
    },
  };
  const log = new FileLog("id", options, io);
  await new Promise((r) => setTimeout(r, 0));
  const one = log.stop();
  const two = log.stop();
  assert.equal(closed, 1);
  release();
  await Promise.all([one, two]);
  assert.equal(log.status, "stopped");
});
test("tiny packet backlog is bounded while disk write is blocked and closes once", async () => {
  let release!: (value: typeof info) => void;
  let entered!: () => void;
  const writing = new Promise<void>((r) => (entered = r));
  let writes = 0;
  let closes = 0;
  const errors: string[] = [];
  const io: LogIO = {
    start: async () => info,
    append: () => {
      writes++;
      entered();
      return new Promise((r) => (release = r));
    },
    stop: async () => { closes++; },
  };
  const log = new FileLog("id", options, io, (error) => errors.push(error));
  log.write(new Uint8Array([42]));
  await writing;
  for (let i = 0; i < 4096; i++) log.write(new Uint8Array([i % 256]));
  assert.equal(log.status, "recording");
  log.write(new Uint8Array([1]));
  log.write(new Uint8Array([2]));
  assert.equal(log.status, "error");
  assert.match(log.error, /4096/);
  assert.equal(errors.length, 1);
  const stopped = log.stop();
  release(info);
  await stopped;
  assert.equal(writes, 1);
  assert.equal(closes, 1);
});
test("4096 tiny queued chunks still flush in order at the supported limit", async () => {
  let ready!: (value: typeof info) => void;
  const recorded: number[] = [];
  const io: LogIO = {
    start: () => new Promise((r) => (ready = r)),
    append: async (_, bytes) => { recorded.push(...bytes); return info; },
    stop: async () => {},
  };
  const log = new FileLog("id", options, io);
  const expected = Array.from({ length: 4096 }, (_, i) => i % 256);
  for (const byte of expected) log.write(new Uint8Array([byte]));
  const stopped = log.stop();
  ready(info);
  await stopped;
  assert.equal(log.status, "stopped");
  assert.deepEqual(recorded, expected);
});
