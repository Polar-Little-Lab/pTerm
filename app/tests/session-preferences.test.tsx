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
