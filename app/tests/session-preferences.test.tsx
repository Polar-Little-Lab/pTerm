import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePreferences,
  validPreferences,
  validPreferenceWorkspace,
  defaults,
} from "../src/session-preferences.ts";
import {
  portableWorkspace,
  parsePortable,
  mergePortable,
} from "../src/workspace-transfer.ts";
import { toRtf } from "../src/rtf.ts";
import type { Workspace } from "../src/types";
const host = {
  id: "h",
  name: "server",
  host: "example.test",
  username: "user",
  port: 22,
  group: "prod",
  preferences: { fontSize: 18, cursorBlink: false },
};
const w: Workspace = {
  version: 1,
  hosts: [host],
  snippets: [],
  sessionDefaults: { fontSize: 14, logFiles: 3 },
  groupPreferences: { prod: { fontSize: 16, closeProtected: true } },
};
test("host overrides group overrides workspace; removing a value restores inheritance", () => {
  let p = resolvePreferences(w, host);
  assert.equal(p.fontSize, 18);
  assert.equal(p.cursorBlink, false);
  assert.equal(p.closeProtected, true);
  assert.equal(p.logFiles, 3);
  assert.equal(p.scrollback, defaults.scrollback);
  p = resolvePreferences(w, { ...host, preferences: {} });
  assert.equal(p.fontSize, 16);
  assert.equal(resolvePreferences(w).fontSize, 14);
  assert.equal(
    resolvePreferences(w, { ...host, group: "absent", preferences: undefined })
      .fontSize,
    14,
  );
});
test("invalid schemas, injected keys and out-of-range preferences are rejected", () => {
  for (const bad of [
    null,
    [],
    { fontSize: 33 },
    { logFiles: 0 },
    { logEnabled: "true" },
    { fontFamily: "" },
    { logDirectory: "relative" },
    { scrollback: 1.5 },
    { lineHeight: Infinity },
    { unknown: 42 },
  ])
    assert.equal(validPreferences(bad), false);
  assert.equal(
    validPreferenceWorkspace({ ...w, groupPreferences: [] as any }),
    false,
  );
  assert.equal(validPreferenceWorkspace(w), true);
  assert.equal(
    validPreferenceWorkspace({
      ...w,
      hosts: [{ ...host, preferences: { fontSize: -1 } }],
    }),
    false,
  );
});
test("portable host settings preserve resolved behavior without replacing destination defaults", () => {
  const portable = portableWorkspace(w);
  assert.equal(portable.hosts[0].preferences?.fontSize, 18);
  assert.equal(portable.hosts[0].preferences?.closeProtected, true);
  const dest: Workspace = {
    version: 1,
    hosts: [],
    snippets: [],
    sessionDefaults: { fontSize: 10 },
    groupPreferences: { prod: { fontSize: 11 } },
  };
  const merged = mergePortable(
    dest,
    parsePortable(JSON.stringify(portable)),
    () => "new",
  );
  assert.equal(merged.sessionDefaults, dest.sessionDefaults);
  assert.equal(resolvePreferences(merged, merged.hosts[0]).fontSize, 18);
  assert.equal(resolvePreferences(merged).fontSize, 10);
});
test("RTF escapes Unicode, braces, slash and removes terminal control sequences", () => {
  const rtf = toRtf("\x1b[31m한글 {x}\\\n😀\tend\x1b]0;title\x07");
  assert.match(rtf, /\\u-10916\?/);
  assert.ok(rtf.includes("\\{x\\}\\\\"));
  assert.ok(rtf.includes("\\par"));
  assert.ok(rtf.includes("\\u-10179?\\u-8704?"));
  assert.ok(!rtf.includes("31m"));
  assert.ok(!rtf.includes("title"));
  assert.ok(rtf.endsWith("}"));
});
test("startup settings require bounded text and booleans", () => {
  assert.equal(
    validPreferences({
      startupEnabled: true,
      startupCommand: "echo ready\necho done",
    }),
    true,
  );
  assert.equal(validPreferences({ startupEnabled: "yes" }), false);
  assert.equal(validPreferences({ startupCommand: "x\0y" }), false);
  assert.equal(validPreferences({ startupCommand: "가".repeat(6000) }), false);
});
test("import preserves automation content but requires re-enabling command execution and disk logging", () => {
  const source = {
    ...w,
    sessionDefaults: {
      startupEnabled: true,
      startupCommand: "echo imported",
      logEnabled: true,
      logDirectory: "/tmp/logs",
    },
  };
  const data = portableWorkspace(source);
  assert.equal(data.hosts[0].preferences?.startupEnabled, true);
  const imported = parsePortable(JSON.stringify(data));
  assert.equal(imported.hosts[0].preferences?.startupEnabled, false);
  assert.equal(imported.hosts[0].preferences?.logEnabled, false);
  assert.equal(imported.hosts[0].preferences?.startupCommand, "echo imported");
  assert.equal(imported.hosts[0].preferences?.logDirectory, "/tmp/logs");
});
