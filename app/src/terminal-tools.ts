import {writeFileLog} from './file-log';
import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { Session } from "./types";
export type Trigger = {
  id: string;
  pattern: string;
  message: string;
  enabled: boolean;
};
export type Capture = {
  received: number;
  recent: string;
  inputRecording: boolean;
  recordedInput: string[];
  bindings: Record<string, string>;
  recording: boolean;
  chunks: { time: string; hex: string; text: string }[];
  size: number;
  truncated: boolean;
  decoder: TextDecoder;
  tail: string;
  triggers: Trigger[];
  last: Map<string, number>;
  alerts: string[];
};
const states = new WeakMap<Session, Capture>();
export function captureFor(session: Session): Capture {
  let state = states.get(session);
  if (!state) {
    state = {
      received: 0,
      recent: "",
      inputRecording: false,
      recordedInput: [],
      bindings: {},
      recording: false,
      chunks: [],
      size: 0,
      truncated: false,
      decoder: new TextDecoder(),
      tail: "",
      triggers: [],
      last: new Map(),
      alerts: [],
    };
    states.set(session, state);
  }
  return state;
}
export function receiveOutput(session: Session, bytes: Uint8Array) {
  const state = captureFor(session),
    text = state.decoder.decode(bytes, { stream: true });
  writeFileLog(session,bytes,text);
  if (state.recording) {
    const chunk = {
      time: new Date().toISOString(),
      text,
      hex: Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" "),
    };
    state.chunks.push(chunk);
    state.size += bytes.length;
    while (
      (state.size > 1024 * 1024 || state.chunks.length > 4096) &&
      state.chunks.length
    ) {
      const removed = state.chunks.shift()!;
      state.size -= Math.ceil(removed.hex.length / 3);
      state.truncated = true;
    }
  }
  state.received += text.length;
  state.recent = (state.recent + text).slice(-8192);
  const incoming = state.tail + text;
  for (const rule of state.triggers) {
    if (!rule.enabled || !rule.pattern || rule.pattern.length > 256) continue;
    const at = incoming.indexOf(
      rule.pattern,
      Math.max(0, state.tail.length - rule.pattern.length + 1),
    );
    if (at >= 0 && Date.now() - (state.last.get(rule.id) || 0) > 5000) {
      state.last.set(rule.id, Date.now());
      state.alerts.push(
        `${new Date().toLocaleTimeString()} · ${rule.message || rule.pattern}`,
      );
      state.alerts = state.alerts.slice(-100);
    }
  }
  state.tail = incoming.slice(-256);
}
export function screenText(session: Session) {
  const buffer = session.terminal.buffer.active;
  return Array.from(
    { length: buffer.length },
    (_, i) => buffer.getLine(i)?.translateToString(true) || "",
  ).join("\n");
}
export function findMatches(
  lines: string[],
  query: string,
  regex = false,
  caseSensitive = false,
) {
  if (!query) return [];
  const pattern = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Search is user initiated and bounded by the terminal scrollback.
  const re = new RegExp(pattern, caseSensitive ? "gu" : "giu"),
    matches: { row: number; col: number; length: number }[] = [];
  for (let row = 0; row < lines.length; row++) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(lines[row]))) {
      matches.push({ row, col: m.index, length: m[0].length });
      if (matches.length >= 2000) return matches;
      if (!m[0].length) re.lastIndex++;
    }
  }
  return matches;
}
export async function exportText(
  filename: string,
  text: string,
  mime = "text/plain;charset=utf-8",
) {
  if (isTauri()) {
    const path = await save({ defaultPath: filename });
    if (path) await invoke("save_text_file", { path, text });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function clearCapture(session: Session) {
  const state = captureFor(session);
  state.chunks = [];
  state.size = 0;
  state.truncated = false;
  state.alerts = [];
}

export function recordInput(session: Session, data: string) {
  const state = captureFor(session);
  if (!state.inputRecording) return;
  if (
    state.recordedInput.length >= 200 ||
    state.recordedInput.join("").length + data.length > 65536
  ) {
    state.inputRecording = false;
    return;
  }
  state.recordedInput.push(data);
}
