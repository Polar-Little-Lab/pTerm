import { invoke } from "@tauri-apps/api/core";
import type { Session, Workspace } from "./types";
import { resolvePreferences, terminalOptions } from "./session-preferences";
import { startFileLog } from "./file-log";
export function configureSession(
  session: Session,
  workspace: Workspace,
  onError: (error: string) => void,
) {
  const p = resolvePreferences(
    workspace,
    session.kind === "ssh" ? session.host : undefined,
  );
  session.preferences = p;
  session.closeProtected = p.closeProtected;
  Object.assign(session.terminal.options, terminalOptions(p));
  if (p.logEnabled) {
    try {
      startFileLog(session, p, (error) => onError(`파일 기록 실패 · ${error}`));
    } catch (error) {
      onError(String(error));
    }
  }
}

export async function runLoginCommand(
  session: Session,
  send: (bytes: number[]) => Promise<unknown> = (bytes) =>
    invoke("send_input", { id: session.id, bytes }),
) {
  const p = session.preferences;
  if (
    session.kind !== "ssh" ||
    !p?.startupEnabled ||
    !p.startupCommand.trim() ||
    session.startupSent
  )
    return;
  session.startupSent = true;
  const bytes = new TextEncoder().encode(
    p.startupCommand.replace(/[\r\n]+$/, "") + "\r",
  );
  if (bytes.length > 16384) throw new Error("연결 후 명령 크기 제한 초과");
  session.queuedInputBytes += bytes.length;
  let failure: unknown;
  session.inputQueue = session.inputQueue
    .then(async () => {
      if (session.closed || session.status !== "connected")
        throw new Error("연결이 종료되어 시작 명령을 취소했습니다.");
      await send(Array.from(bytes));
    })
    .catch((error) => {
      session.inputFailures = (session.inputFailures || 0) + 1;
      failure = error;
    })
    .finally(() => {
      session.queuedInputBytes -= bytes.length;
    });
  await session.inputQueue;
  if (failure) throw failure;
}
