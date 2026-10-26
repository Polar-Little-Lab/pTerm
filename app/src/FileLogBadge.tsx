import { useEffect, useState } from "react";
import type { Session } from "./types";
import { fileLogFor } from "./file-log";
export function FileLogBadge({ session }: { session: Session }) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => refresh((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, []);
  const log = fileLogFor(session);
  if (!log || log.status === "stopped") return null;
  return (
    <span
      className={`file-log-badge ${log.status === "error" ? "has-error" : ""}`}
      title={log.error || log.info?.path || "로그 파일 준비 중"}
      aria-label={log.status === "error" ? "파일 기록 오류" : "파일 기록 중"}
    >
      {log.status === "error" ? "기록 오류" : "기록"}
    </span>
  );
}
