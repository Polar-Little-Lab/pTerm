import type { Host, Workspace } from "./types";
export type SessionPreferences = {
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  scrollback?: number;
  cursorStyle?: "block" | "underline" | "bar";
  cursorBlink?: boolean;
  closeProtected?: boolean;
  logEnabled?: boolean;
  logDirectory?: string;
  logMaxMiB?: number;
  logFiles?: number;
  logTimestamps?: boolean;
};
export const defaults: Required<SessionPreferences> = {
  fontSize: 13,
  fontFamily: '"SFMono-Regular", Menlo, monospace',
  lineHeight: 1.4,
  scrollback: 5000,
  cursorStyle: "block",
  cursorBlink: true,
  closeProtected: false,
  logEnabled: false,
  logDirectory: "",
  logMaxMiB: 10,
  logFiles: 5,
  logTimestamps: false,
};
export const preferenceKeys = Object.keys(
  defaults,
) as (keyof SessionPreferences)[];
export function validPreferences(value: unknown): value is SessionPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  for (const [key, v] of Object.entries(value)) {
    if (!preferenceKeys.includes(key as keyof SessionPreferences)) return false;
    if (v === undefined) continue;
    if (
      ["cursorBlink", "closeProtected", "logEnabled", "logTimestamps"].includes(
        key,
      )
    ) {
      if (typeof v !== "boolean") return false;
    } else if (key === "cursorStyle") {
      if (!["block", "underline", "bar"].includes(v as string)) return false;
    } else if (key === "fontFamily" || key === "logDirectory") {
      if (typeof v !== "string" || v.length > 4096 || /[\0\r\n]/.test(v))
        return false;
      if (key === "fontFamily" && !v.trim()) return false;
      if (key === "logDirectory" && v && !v.startsWith("/")) return false;
    } else {
      const ranges: Record<string, [number, number]> = {
        fontSize: [9, 32],
        lineHeight: [1, 2],
        scrollback: [0, 100000],
        logMaxMiB: [1, 100],
        logFiles: [1, 100],
      };
      const range = ranges[key];
      if (
        !range ||
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        v < range[0] ||
        v > range[1] ||
        (key !== "lineHeight" && !Number.isInteger(v))
      )
        return false;
    }
  }
  return true;
}
export function validPreferenceWorkspace(w: {
  sessionDefaults?: SessionPreferences;
  groupPreferences?: Record<string, SessionPreferences>;
  hosts: Host[];
}): boolean {
  return (
    (w.sessionDefaults === undefined || validPreferences(w.sessionDefaults)) &&
    (w.groupPreferences === undefined ||
      (!!w.groupPreferences &&
        typeof w.groupPreferences === "object" &&
        !Array.isArray(w.groupPreferences) &&
        Object.entries(w.groupPreferences).length <= 1000 &&
        Object.entries(w.groupPreferences).every(
          ([k, v]) =>
            k.length > 0 &&
            k.length <= 1024 &&
            !/[\0\r\n]/.test(k) &&
            validPreferences(v),
        ))) &&
    w.hosts.every(
      (h) => h.preferences === undefined || validPreferences(h.preferences),
    )
  );
}
export function resolvePreferences(
  w: Pick<Workspace, "sessionDefaults" | "groupPreferences">,
  host?: Host,
): Required<SessionPreferences> {
  const group =
    host?.group &&
    w.groupPreferences &&
    Object.hasOwn(w.groupPreferences, host.group)
      ? w.groupPreferences[host.group]
      : {};
  const defined = (p: SessionPreferences | undefined) =>
    Object.fromEntries(
      Object.entries(p || {}).filter(([, v]) => v !== undefined),
    );
  return {
    ...defaults,
    ...defined(w.sessionDefaults),
    ...defined(group),
    ...defined(host?.preferences),
  } as Required<SessionPreferences>;
}
export function terminalOptions(p: Required<SessionPreferences>) {
  return {
    fontSize: p.fontSize,
    fontFamily: p.fontFamily,
    lineHeight: p.lineHeight,
    scrollback: p.scrollback,
    cursorStyle: p.cursorStyle,
    cursorBlink: p.cursorBlink,
  };
}
