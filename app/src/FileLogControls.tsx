import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@tauri-apps/api/core";
import type { Session } from "./types";
import { defaults } from "./session-preferences";
import { fileLogFor, startFileLog, stopFileLog } from "./file-log";
export function FileLogControls({
  session,
  onError,
}: {
  session: Session;
  onError: (s: string) => void;
}) {
  const [directory, setDirectory] = useState(
      session.preferences?.logDirectory || "",
    ),
    [maxMiB, setMaxMiB] = useState(session.preferences?.logMaxMiB || 10),
    [files, setFiles] = useState(session.preferences?.logFiles || 5),
    [timestamps, setTimestamps] = useState(
      !!session.preferences?.logTimestamps,
    ),
    [, refresh] = useState(0);
  const log = fileLogFor(session),
    active = log && !["stopped", "error"].includes(log.status);
  return (
    <details open>
      <summary>파일에 연속 기록</summary>
      <p>
        메모리 기록과 별개로 파일에 계속 저장합니다. 연결 종료 시 남은 기록을
        저장하고 닫습니다. 회전은 현재 기록 폴더 안에서만 적용됩니다.
      </p>
      <label>
        저장 폴더
        <div className="tools-row">
          <input
            aria-label="로그 저장 폴더"
            value={directory}
            disabled={!!active}
            onChange={(e) => setDirectory(e.target.value)}
          />
          <button
            disabled={!!active || !isTauri()}
            onClick={() =>
              void open({ directory: true, multiple: false })
                .then((p) => {
                  if (typeof p === "string") setDirectory(p);
                })
                .catch((e) => onError(String(e)))
            }
          >
            폴더 선택
          </button>
        </div>
      </label>
      <div className="form-row">
        <label>
          파일당 MiB
          <input
            type="number"
            min={1}
            max={100}
            disabled={!!active}
            value={maxMiB}
            onChange={(e) => setMaxMiB(Number(e.target.value))}
          />
        </label>
        <label>
          보존 파일 수
          <input
            type="number"
            min={1}
            max={100}
            disabled={!!active}
            value={files}
            onChange={(e) => setFiles(Number(e.target.value))}
          />
        </label>
      </div>
      <label className="check-inline">
        <input
          type="checkbox"
          disabled={!!active}
          checked={timestamps}
          onChange={(e) => setTimestamps(e.target.checked)}
        />
        수신 청크별 시각 · 끄면 수신 바이트 그대로 저장
      </label>
      <div className="tools-row">
        <button
          disabled={
            !!active ||
            !isTauri() ||
            session.closed ||
            session.status !== "connected" ||
            !directory.startsWith("/") ||
            !Number.isInteger(maxMiB) ||
            maxMiB < 1 ||
            maxMiB > 100 ||
            !Number.isInteger(files) ||
            files < 1 ||
            files > 100
          }
          onClick={() => {
            try {
              startFileLog(
                session,
                {
                  ...defaults,
                  ...session.preferences,
                  logDirectory: directory,
                  logMaxMiB: maxMiB,
                  logFiles: files,
                  logTimestamps: timestamps,
                },
                onError,
              );
              refresh((x) => x + 1);
            } catch (e) {
              onError(String(e));
            }
          }}
        >
          파일 기록 시작
        </button>
        <button
          disabled={!active || log?.status === "stopping"}
          onClick={() =>
            void stopFileLog(session).then(() => refresh((x) => x + 1))
          }
        >
          남은 기록 저장·중지
        </button>
      </div>
      {log && (
        <p role="status">
          {
            {
              starting: "파일 여는 중",
              recording: "기록 중",
              stopping: "남은 기록 저장 중",
              stopped: "기록 종료",
              error: "기록 오류",
            }[log.status]
          }
          {log.info && (
            <>
              {" "}
              · {(log.info.bytes / 1024).toFixed(1)} KiB · 회전{" "}
              {log.info.rotations}회<br />
              <code>{log.info.path}</code>
            </>
          )}
          {log.error && (
            <>
              <br />
              {log.error}
            </>
          )}
        </p>
      )}
    </details>
  );
}
