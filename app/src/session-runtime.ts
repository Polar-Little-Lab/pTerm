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
