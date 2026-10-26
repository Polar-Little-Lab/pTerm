import { test } from "node:test";
import assert from "node:assert/strict";
import {
  portableWorkspace,
  parsePortable,
  mergePortable,
} from "../src/workspace-transfer.ts";
import type { Workspace } from "../src/types.ts";
const workspace: Workspace = {
  version: 1,
  hosts: [
    {
      id: "jump",
      name: "gateway",
      host: "jump.test",
      port: 22,
      username: "user",
      fingerprint: "trusted",
    },
    {
      id: "child",
      name: "inside",
      host: "inside.test",
      port: 22,
      username: "user",
      bastionHostId: "jump",
    },
  ],
  snippets: [],
  credentials: [{ hostId: "jump", scope: "secret", secret: "password" }],
};
test("portable format excludes secrets and trust even when injected", () => {
  const raw = JSON.stringify(portableWorkspace(workspace));
  assert.ok(!raw.includes("password"));
  assert.ok(!raw.includes("trusted"));
  const injected = JSON.parse(raw);
  injected.hosts[0].fingerprint = "forged";
  injected.credentials = workspace.credentials;
  const imported = parsePortable(JSON.stringify(injected));
  assert.ok(!JSON.stringify(imported).includes("forged"));
  assert.ok(!JSON.stringify(imported).includes("password"));
});
test("merge remaps jump references while preserving original data", () => {
  let count = 0;
  const merged = mergePortable(
    workspace,
    portableWorkspace(workspace),
    () => `new-${++count}`,
  );
  assert.equal(merged.hosts.length, 4);
  assert.equal(merged.hosts[3].bastionHostId, "new-1");
  assert.equal(merged.credentials, workspace.credentials);
  assert.equal(workspace.hosts.length, 2);
});
test("invalid files and cyclic or dangling routes fail before merge", () => {
  const v = portableWorkspace(workspace);
  v.hosts[0].bastionHostId = "child";
  assert.throws(() => parsePortable(JSON.stringify(v)));
  v.hosts[0].bastionHostId = "missing";
  assert.throws(() => parsePortable(JSON.stringify(v)));
  delete v.hosts[0].bastionHostId;
  v.hosts[0].port = 65536;
  assert.throws(() => parsePortable(JSON.stringify(v)));
  assert.throws(() => parsePortable("{}"));
});
