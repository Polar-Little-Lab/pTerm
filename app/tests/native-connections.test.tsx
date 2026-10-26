import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyProfile,
  validNativeData,
  portableNative,
  type AuthProfile,
  type ConnectionPreset,
} from "../src/native-connections.ts";
import {
  portableWorkspace,
  parsePortable,
  mergePortable,
} from "../src/workspace-transfer.ts";
const profile: AuthProfile = {
  id: "auth",
  name: "Team",
  username: "dev",
  identity: "/keys/id",
  certificate: "/keys/cert",
  provider: "",
  gssapi: true,
};
const connection: ConnectionPreset = {
  id: "connection",
  name: "Server",
  profileId: "auth",
  launch: { program: { mode: "ssh", host: "example.test", port: 22 } },
};
test("profiles apply current settings without mutating saved connection", () => {
  assert.equal(
    applyProfile(connection.launch, profile).program.username,
    "dev",
  );
  assert.equal(
    applyProfile(connection.launch, { ...profile, username: "updated" }).program
      .username,
    "updated",
  );
  assert.equal(connection.launch.program.username, undefined);
});
test("native import validates references, bounds, flags and serial settings", () => {
  const data = { profiles: [profile], connections: [connection] };
  assert.ok(validNativeData(data));
  assert.ok(!validNativeData({ ...data, profiles: [] }));
  assert.ok(
    !validNativeData({ ...data, connections: [connection, connection] }),
  );
  for (const program of [
    { mode: "unknown" },
    { mode: "ssh", port: 65536 },
    { mode: "ssh", args: [{}] },
    { mode: "ssh", x11: "true" },
    { mode: "serial" },
    { mode: "ssh", host: "bad\nhost" },
  ])
    assert.ok(
      !validNativeData({
        ...data,
        connections: [{ ...connection, launch: { program } }] as any,
      }),
    );
  const serial = {
    ...connection,
    launch: {
      program: { mode: "serial" },
      serial: {
        path: "/dev/cu.test",
        baud: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flow: "none",
      },
    },
  };
  assert.ok(validNativeData({ ...data, connections: [serial] }));
  assert.ok(
    !validNativeData({
      ...data,
      connections: [
        {
          ...serial,
          launch: {
            ...serial.launch,
            serial: { ...serial.launch.serial, baud: 123 },
          },
        },
      ],
    }),
  );
});
test("portable connections strip injected secrets and remap profile links", () => {
  const data = {
    version: 1 as const,
    hosts: [],
    snippets: [],
    profiles: [{ ...profile, password: "secret" }],
    connections: [
      {
        ...connection,
        launch: {
          program: { ...connection.launch.program, password: "secret" },
        },
      },
    ],
  };
  assert.ok(!JSON.stringify(portableNative(data)).includes("secret"));
  const incoming = parsePortable(JSON.stringify(portableWorkspace(data)));
  let id = 0;
  const merged = mergePortable(data, incoming, () => `new-${++id}`);
  assert.equal(merged.connections?.[1].profileId, merged.profiles?.[1].id);
  assert.equal(merged.connections?.[0], data.connections[0]);
  assert.equal(merged.profiles?.length, 2);
});
