import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Session } from "./types";
import type { SessionPreferences } from "./session-preferences";
export type LogInfo = {
  directory: string;
  path: string;
  bytes: number;
  rotations: number;
};
export type LogIO = {
  start: (
    id: string,
    options: { directory: string; maxMiB: number; files: number },
  ) => Promise<LogInfo>;
  append: (id: string, bytes: number[]) => Promise<LogInfo>;
  stop: (id: string) => Promise<void>;
};
const nativeIO: LogIO = {
  start: (id, options) => invoke("start_file_log", { id, options }),
  append: (id, bytes) => invoke("append_file_log", { id, bytes }),
  stop: (id) => invoke("stop_file_log", { id }),
};
export class FileLog {
  status: "starting" | "recording" | "stopping" | "stopped" | "error" =
    "starting";
  error = "";
  info?: LogInfo;
  private pending: Uint8Array[] = [];
  private queued = 0;
  private accepting = true;
  private started = false;
  private running = false;
  private finished = false;
  private timer?: ReturnType<typeof setTimeout>;
  private resolveDone!: () => void;
  private done = new Promise<void>((r) => (this.resolveDone = r));
  constructor(
    readonly id: string,
    private options: { directory: string; maxMiB: number; files: number },
    private io: LogIO = nativeIO,
    private onError: (error: string) => void = () => {},
  ) {
    this.running = true;
    void this.begin();
  }
  private fail(error: unknown) {
    if (!this.error) {
      this.error = String(error);
      this.onError(this.error);
    }
    this.status = "error";
    this.accepting = false;
    this.pending = [];
    this.queued = 0;
  }
  private async begin() {
    try {
      this.info = await this.io.start(this.id, this.options);
      this.started = true;
      if (this.accepting) this.status = "recording";
    } catch (error) {
      this.fail(error);
    } finally {
      this.running = false;
      void this.pump();
    }
  }
  write(bytes: Uint8Array) {
    if (!this.accepting || !bytes.length) return;
    if (this.queued + bytes.length > 4 * 1024 * 1024) {
      this.fail("로그 쓰기 대기열 4 MiB를 초과해 기록을 중지했습니다.");
      void this.pump();
      return;
    }
    // Tiny packets also consume array/object memory and queue processing time.
    if (this.pending.length >= 4096) {
      this.fail("로그 쓰기 대기열 4096개를 초과해 기록을 중지했습니다.");
      void this.pump();
      return;
    }
    this.pending.push(bytes.slice());
    this.queued += bytes.length;
    if (!this.timer)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.pump();
      }, 40);
  }
  private async pump() {
    if (this.running || this.finished) return;
    this.running = true;
    try {
      if (this.started) {
        while (this.pending.length) {
          let count = 0;
          const parts: Uint8Array[] = [];
          while (
            this.pending.length &&
            count + this.pending[0].length <= 65536
          ) {
            const part = this.pending.shift()!;
            parts.push(part);
            count += part.length;
          }
          if (!parts.length) {
            const part = this.pending.shift()!;
            parts.push(part.slice(0, 65536));
            if (part.length > 65536) this.pending.unshift(part.slice(65536));
            count = Math.min(part.length, 65536);
          }
          this.queued -= count;
          const bytes = new Uint8Array(count);
          let offset = 0;
          for (const part of parts) {
            bytes.set(part, offset);
            offset += part.length;
          }
          this.info = await this.io.append(this.id, Array.from(bytes));
        }
      }
    } catch (error) {
      this.fail(error);
    } finally {
      if (!this.accepting) {
        if (this.timer) clearTimeout(this.timer);
        try {
          if (this.started) await this.io.stop(this.id);
        } catch (error) {
          this.fail(error);
        }
        this.started = false;
        this.finished = true;
        if (!this.error) this.status = "stopped";
        this.resolveDone();
        this.running = false;
      } else {
        this.running = false;
        if (this.pending.length) void this.pump();
      }
    }
  }
  stop() {
    this.accepting = false;
    if (this.status !== "error" && !this.finished) this.status = "stopping";
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    void this.pump();
    return this.done;
  }
}
type SessionLog = { logger: FileLog; timestamps: boolean };
const logs = new WeakMap<Session, SessionLog>();
export function fileLogFor(session: Session) {
  return logs.get(session)?.logger;
}
export function startFileLog(
  session: Session,
  p: Required<SessionPreferences>,
  onError: (error: string) => void,
) {
  const previous = fileLogFor(session);
  if (previous && !["stopped", "error"].includes(previous.status))
    throw new Error("기존 파일 기록을 먼저 중지하세요.");
  if (!isTauri()) throw new Error("파일 기록은 macOS 앱에서 지원합니다.");
  const logger = new FileLog(
    crypto.randomUUID(),
    { directory: p.logDirectory, maxMiB: p.logMaxMiB, files: p.logFiles },
    nativeIO,
    onError,
  );
  logs.set(session, { logger, timestamps: p.logTimestamps });
  return logger;
}
export function writeFileLog(
  session: Session,
  bytes: Uint8Array,
  text: string,
) {
  const state = logs.get(session);
  if (!state) return;
  if (state.timestamps) {
    if (text)
      state.logger.write(
        new TextEncoder().encode(`[${new Date().toISOString()}] ${text}\n`),
      );
  } else state.logger.write(bytes);
}
export function stopFileLog(session: Session) {
  return fileLogFor(session)?.stop() || Promise.resolve();
}
