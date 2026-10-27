import type { Session } from "./types";
import { captureFor } from "./terminal-tools";
export type ScriptRequest = {
  seq: number;
  operation: "send" | "expect" | "sleep";
  value: unknown;
  timeout?: number;
};
export function scriptSession(session: Session, signal: AbortSignal) {
  let since = captureFor(session).received,
    count = 0;
  const check = () => {
    if (signal.aborted || session.closed || session.status !== "connected")
      throw new Error("세션 또는 스크립트가 종료되었습니다.");
  };
  const pause = () => new Promise((resolve) => setTimeout(resolve, 25));
  return async (request: ScriptRequest): Promise<string | null> => {
    check();
    if (++count > 10000) throw new Error("스크립트 요청 제한 10,000회 초과");
    if (request.operation === "send") {
      if (
        typeof request.value !== "string" ||
        new TextEncoder().encode(request.value).length > 16384
      )
        throw new Error("send는 최대 16 KiB 문자열입니다.");
      since = captureFor(session).received;
      const failures = session.inputFailures || 0;
      session.terminal.input(request.value, false);
      await session.inputQueue;
      check();
      if ((session.inputFailures || 0) !== failures)
        throw new Error("입력 전송 실패");
      return null;
    }
    if (request.operation === "sleep") {
      if (
        typeof request.value !== "number" ||
        !Number.isInteger(request.value) ||
        request.value < 0 ||
        request.value > 30000
      )
        throw new Error("sleep 범위는 0–30000ms입니다.");
      const end = Date.now() + request.value;
      while (Date.now() < end) {
        check();
        await pause();
      }
      check();
      return null;
    }
    if (
      request.operation !== "expect" ||
      typeof request.value !== "string" ||
      !request.value ||
      request.value.length > 256
    )
      throw new Error("expect는 1–256자 문자열입니다.");
    const timeout = request.timeout ?? 10000;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60000)
      throw new Error("대기 시간은 1–60000ms입니다.");
    const end = Date.now() + timeout;
    while (true) {
      check();
      const state = captureFor(session),
        base = state.received - state.recent.length;
      const start = Math.max(0, since - base),
        index = state.recent.indexOf(request.value, start);
      if (index >= 0) {
        const matched = state.recent.slice(start, index + request.value.length);
        since = base + index + request.value.length;
        return matched;
      }
      if (Date.now() >= end) throw new Error("출력 대기 시간 초과");
      await pause();
    }
  };
}
