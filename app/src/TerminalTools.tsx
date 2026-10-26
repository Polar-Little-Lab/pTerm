import { FileLogControls } from "./FileLogControls";
import { toRtf } from "./rtf";
import { LogReplay } from "./LogReplay";
import { AutomationTools } from "./AutomationTools";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { TunnelTools } from "./TunnelTools";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./components";
import type { Session } from "./types";
import {
  captureFor,
  clearCapture,
  exportText,
  screenText,
} from "./terminal-tools";
export type ToolPage =
  | "compose"
  | "search"
  | "logs"
  | "triggers"
  | "display"
  | "tunnels"
  | "automation";
export function TerminalTools({
  sessions,
  current,
  page,
  onPage,
  onClose,
  onError,
  onSessionChange,
  onPreferences,
}: {
  onSessionChange?: () => void;
  onPreferences?: () => void;
  sessions: Session[];
  current?: Session;
  page: ToolPage;
  onPage: (p: ToolPage) => void;
  onClose: () => void;
  onError: (s: string) => void;
}) {
  const [text, setText] = useState(""),
    [targets, setTargets] = useState<string[]>(current ? [current.id] : []),
    [confirm, setConfirm] = useState(false),
    [query, setQuery] = useState(""),
    [regex, setRegex] = useState(false),
    [caseSensitive, setCase] = useState(false),
    [result, setResult] = useState(""),
    [index, setIndex] = useState(-1),
    [, redraw] = useState(0),
    [hex, setHex] = useState(false),
    [pattern, setPattern] = useState(""),
    [message, setMessage] = useState("");
  const [triggerAction, setTriggerAction] = useState<"notify" | "send">(
      "notify",
    ),
    [triggerCommand, setTriggerCommand] = useState(""),
    [triggerEnter, setTriggerEnter] = useState(true),
    [triggerRuns, setTriggerRuns] = useState(1),
    [triggerCooldown, setTriggerCooldown] = useState(5),
    [triggerReview, setTriggerReview] = useState(false);
  useEffect(
    () => setTriggerReview(false),
    [
      triggerAction,
      triggerCommand,
      triggerEnter,
      triggerRuns,
      triggerCooldown,
      pattern,
      current?.id,
    ],
  );
  useEffect(() => {
    const timer = setInterval(() => redraw((x) => x + 1), 500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setIndex(-1);
    setResult("");
    setConfirm(false);
  }, [query, regex, caseSensitive, current?.id]);
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [query, regex, caseSensitive, current?.id]);
  const capture = current ? captureFor(current) : undefined;
  function search(direction: number) {
    if (!current) return;
    workerRef.current?.terminate();
    const buffer = current.terminal.buffer.active,
      lines = Array.from(
        { length: buffer.length },
        (_, i) => buffer.getLine(i)?.translateToString(true) || "",
      );
    const worker = new Worker(new URL("./search.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    const timer = setTimeout(() => {
      if (workerRef.current !== worker) return;
      worker.terminate();
      workerRef.current = null;
      setResult("검색 시간이 초과되었습니다. 더 구체적인 검색식을 사용하세요.");
    }, 500);
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
        setResult("검색을 실행하지 못했습니다.");
      }
    };
    worker.onmessage = (
      e: MessageEvent<{
        hits?: { row: number; col: number; length: number }[];
        error?: string;
      }>,
    ) => {
      clearTimeout(timer);
      worker.terminate();
      if (workerRef.current !== worker) return;
      workerRef.current = null;
      if (e.data.error) {
        setResult(`검색식 오류: ${e.data.error}`);
        return;
      }
      const hits = e.data.hits || [];
      if (!hits.length) {
        setResult("일치하는 결과가 없습니다.");
        return;
      }
      const next = (index + direction + hits.length) % hits.length,
        hit = hits[next];
      setIndex(next);
      setResult(
        `${next + 1} / ${hits.length}${hits.length === 2000 ? " (최대 2,000개)" : ""}`,
      );
      const line = buffer.getLine(hit.row);
      let offset = 0,
        start = 0,
        end = 0;
      for (let col = 0; line && col < line.length; col++) {
        const cell = line.getCell(col);
        if (cell?.getWidth() === 0) continue;
        const chars = cell?.getChars() || " ";
        if (offset <= hit.col) start = col;
        if (offset < hit.col + hit.length) end = col + (cell?.getWidth() || 1);
        offset += chars.length;
      }
      current.terminal.select(start, hit.row, Math.max(1, end - start));
      current.terminal.scrollToLine(hit.row);
    };
    worker.postMessage({ lines, query, regex, caseSensitive });
  }
  const selected = sessions.filter(
    (s) => targets.includes(s.id) && s.status === "connected" && !s.closed,
  );
  return createPortal(
    <Modal
      title="터미널 도구"
      eyebrow={current?.host.name || "WORKSPACE"}
      onClose={onClose}
    >
      <nav className="tools-nav" aria-label="터미널 도구">
        {(
          [
            ["compose", "작성·다중 전송"],
            ["search", "검색"],
            ["logs", "기록·Hex"],
            ["triggers", "트리거"],
            ["display", "화면"],
            ["tunnels", "터널"],
            ["automation", "자동화"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={page === key}
            onClick={() => {
              onPage(key);
              setConfirm(false);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {page === "automation" && <AutomationTools current={current} />}
      {page === "tunnels" && <TunnelTools current={current} />}
      {page === "compose" && (
        <>
          <p className="modal-description">
            내용과 대상을 확인한 후 전송합니다. 줄바꿈이 있으면 명령이 실행될 수
            있습니다.
          </p>
          <textarea
            aria-label="작성할 명령"
            className="tools-editor"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setConfirm(false);
            }}
            spellCheck={false}
          />
          <fieldset>
            <legend>전송 대상 · {selected.length}개</legend>
            {sessions
              .filter((s) => s.status === "connected" && !s.closed)
              .map((s) => (
                <label className="check-inline" key={s.id}>
                  <input
                    type="checkbox"
                    checked={targets.includes(s.id)}
                    onChange={(e) => {
                      setTargets((ids) =>
                        e.target.checked
                          ? [...ids, s.id]
                          : ids.filter((id) => id !== s.id),
                      );
                      setConfirm(false);
                    }}
                  />
                  {s.host.name || s.host.host} ·{" "}
                  {s.kind === "local" ? "LOCAL" : s.host.host}
                </label>
              ))}
          </fieldset>
          {confirm && (
            <p role="status">
              {selected.map((s) => s.host.name || s.host.host).join(", ")}에
              전송합니다.
            </p>
          )}
          <div className="modal-actions">
            <button
              disabled={!text}
              onClick={() =>
                exportText("pterm-commands.txt", text).catch((e) =>
                  onError(String(e)),
                )
              }
            >
              텍스트 저장
            </button>
            <button
              className="primary"
              disabled={
                !text ||
                !selected.length ||
                new TextEncoder().encode(text).length > 1024 * 1024
              }
              onClick={() => {
                if (!confirm) {
                  setConfirm(true);
                  return;
                }
                try {
                  for (const s of selected) s.terminal.paste(text);
                  setConfirm(false);
                  setResult(
                    `${selected.length}개 터미널 입력 대기열에 전달했습니다.`,
                  );
                } catch (e) {
                  onError(String(e));
                }
              }}
            >
              {confirm ? "확인한 대상에 전송" : "전송 대상 확인"}
            </button>
          </div>
          <p role="status">{result}</p>
        </>
      )}
      {page === "search" && (
        <>
          <label>
            터미널 스크롤백 검색
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") search(e.shiftKey ? -1 : 1);
              }}
            />
          </label>
          <div className="tools-row">
            <label>
              <input
                type="checkbox"
                checked={regex}
                onChange={(e) => setRegex(e.target.checked)}
              />
              정규식
            </label>
            <label>
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCase(e.target.checked)}
              />
              대소문자 구분
            </label>
            <button disabled={!current || !query} onClick={() => search(-1)}>
              이전
            </button>
            <button disabled={!current || !query} onClick={() => search(1)}>
              다음
            </button>
          </div>
          <p role="status">{result}</p>
        </>
      )}
      {page === "logs" && capture && current && (
        <>
          <FileLogControls
            key={current.id}
            session={current}
            onError={onError}
          />
          {onPreferences && (
            <button onClick={onPreferences}>연결 시 자동 기록 설정</button>
          )}
          <p className="modal-description">
            기록을 켠 이후의 수신 데이터만 메모리에 보관합니다. 최대 1 MiB이며
            초과하면 오래된 기록부터 제거합니다.
          </p>
          <div className="tools-row">
            <button
              aria-pressed={capture.recording}
              onClick={() => {
                capture.recording = !capture.recording;
                redraw((x) => x + 1);
              }}
            >
              {capture.recording ? "기록 중지" : "기록 시작"}
            </button>
            <label>
              <input
                type="checkbox"
                checked={hex}
                onChange={(e) => setHex(e.target.checked)}
              />
              Hex 표시
            </label>
            <button
              onClick={() =>
                exportText(
                  "pterm-session.log",
                  capture.chunks
                    .map((c) => `[${c.time}] ${hex ? c.hex : c.text}`)
                    .join("\n"),
                ).catch((e) => onError(String(e)))
              }
            >
              기록 저장
            </button>
            <button
              onClick={() =>
                exportText(
                  "pterm-session.json",
                  JSON.stringify({
                    format: "pterm-log",
                    version: 1,
                    chunks: capture.chunks,
                  }),
                  "application/json",
                ).catch((e) => onError(String(e)))
              }
            >
              재생용 JSON 저장
            </button>
            <button
              onClick={() =>
                void exportText(
                  "pterm-session.rtf",
                  toRtf(capture.chunks.map((c) => c.text).join("")),
                  "application/rtf",
                ).catch((e) => onError(String(e)))
              }
            >
              RTF 저장
            </button>
            <button
              onClick={() => {
                clearCapture(current);
                redraw((x) => x + 1);
              }}
            >
              기록 지우기
            </button>
          </div>
          {capture.truncated && (
            <p role="status">용량 제한으로 앞부분이 제거되었습니다.</p>
          )}
          <pre className="tools-output">
            {capture.chunks
              .slice(-100)
              .map((c) => `[${c.time}] ${hex ? c.hex : c.text}`)
              .join("\n") || "기록된 출력이 없습니다."}
          </pre>
          <LogReplay />
        </>
      )}
      {page === "triggers" && capture && (
        <>
          <p className="modal-description">
            문자열을 감지하면 알림 또는 자동 명령을 실행합니다. 자동 전송은 기본
            1회이며 최대 10회로 제한합니다. 도구 화면을 닫아도 규칙은 유지되며,
            세션을 닫으면 사라집니다.
          </p>
          <label>
            감지 문자열
            <input
              maxLength={256}
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
            />
          </label>
          <label>
            알림 내용
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <label>
            동작
            <select
              value={triggerAction}
              onChange={(e) =>
                setTriggerAction(e.target.value as "notify" | "send")
              }
            >
              <option value="notify">알림만 기록</option>
              <option value="send">자동 명령 전송</option>
            </select>
          </label>
          {triggerAction === "send" && (
            <>
              <label>
                자동 전송할 문자열
                <textarea
                  aria-label="자동 전송할 문자열"
                  value={triggerCommand}
                  maxLength={4096}
                  onChange={(e) => setTriggerCommand(e.target.value)}
                />
              </label>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={triggerEnter}
                  onChange={(e) => setTriggerEnter(e.target.checked)}
                />
                끝에 Enter 전송
              </label>
              <div className="form-row">
                <label>
                  최대 실행 횟수
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={triggerRuns}
                    onChange={(e) => setTriggerRuns(Number(e.target.value))}
                  />
                </label>
                <label>
                  최소 간격 · 초
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={triggerCooldown}
                    onChange={(e) => setTriggerCooldown(Number(e.target.value))}
                  />
                </label>
              </div>
              {triggerReview && (
                <div role="status">
                  <p>
                    대상: {current?.host.name}. “{pattern}” 감지 시 최대{" "}
                    {triggerRuns}회 전송합니다. 출력이 다시 조건과 일치해도
                    횟수·간격 제한을 적용합니다.
                  </p>
                  <pre className="tools-output">
                    {JSON.stringify(
                      triggerCommand + (triggerEnter ? "\r" : ""),
                    )}
                  </pre>
                </div>
              )}
            </>
          )}
          <button
            disabled={
              !pattern ||
              capture.triggers.length >= 50 ||
              (triggerAction === "send" &&
                (!triggerCommand ||
                  !current ||
                  current.closed ||
                  current.status !== "connected" ||
                  !Number.isInteger(triggerRuns) ||
                  triggerRuns < 1 ||
                  triggerRuns > 10 ||
                  !Number.isInteger(triggerCooldown) ||
                  triggerCooldown < 1 ||
                  triggerCooldown > 60))
            }
            onClick={() => {
              if (triggerAction === "send" && !triggerReview) {
                setTriggerReview(true);
                return;
              }
              capture.triggers.push({
                action: triggerAction,
                command:
                  triggerAction === "send"
                    ? triggerCommand + (triggerEnter ? "\r" : "")
                    : undefined,
                maxRuns: triggerRuns,
                cooldownMs: triggerCooldown * 1000,
                runs: 0,
                id: crypto.randomUUID(),
                pattern,
                message,
                enabled: true,
              });
              setPattern("");
              setMessage("");
            }}
          >
            {triggerAction === "send"
              ? triggerReview
                ? "확인한 자동 명령 등록"
                : "자동 명령 검토"
              : "규칙 추가"}
          </button>
          <button
            onClick={() => {
              for (const r of capture.triggers)
                if (r.action === "send") r.enabled = false;
              redraw((x) => x + 1);
            }}
          >
            자동 전송 모두 중지
          </button>
          {capture.triggers.map((rule) => (
            <div className="tools-row" key={rule.id}>
              <label>
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => {
                    rule.enabled = e.target.checked;
                    redraw((x) => x + 1);
                  }}
                />
                {rule.pattern}
                {rule.action === "send"
                  ? ` · 자동 전송 ${rule.runs || 0}/${rule.maxRuns || 1}${rule.pending ? " (전송 중)" : ""}`
                  : " · 알림"}
              </label>
              {rule.action === "send" && (
                <>
                  <code>{JSON.stringify(rule.command)}</code>
                  <button
                    disabled={rule.pending}
                    onClick={() => {
                      rule.runs = 0;
                      rule.enabled = true;
                      capture.last.delete(rule.id);
                      redraw((x) => x + 1);
                    }}
                  >
                    횟수 초기화·다시 준비
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  capture.triggers = capture.triggers.filter(
                    (r) => r.id !== rule.id,
                  );
                  redraw((x) => x + 1);
                }}
              >
                삭제
              </button>
            </div>
          ))}
          <pre className="tools-output" aria-live="polite">
            {capture.alerts.join("\n") || "감지된 알림이 없습니다."}
          </pre>
        </>
      )}
      {page === "display" && current && (
        <>
          {onPreferences && (
            <button onClick={onPreferences}>
              기본값·그룹·호스트 상속 설정
            </button>
          )}
          <p>
            아래 변경은 현재 세션에만 적용됩니다. 다음 연결에도 유지하려면 상속
            설정에서 저장하세요.
          </p>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={!!current.closeProtected}
              onChange={(e) => {
                current.closeProtected = e.target.checked;
                onSessionChange?.();
                redraw((x) => x + 1);
              }}
            />
            닫기 보호 · 실수로 탭이나 분할 영역 닫기 방지
          </label>
          <label>
            글꼴 크기
            <input
              type="number"
              min={9}
              max={32}
              value={current.terminal.options.fontSize || 13}
              onChange={(e) => {
                const size = Number(e.target.value);
                if (size >= 9 && size <= 32) {
                  current.terminal.options.fontSize = size;
                  current.fit.fit();
                  if (isTauri())
                    void invoke("resize_terminal", {
                      id: current.id,
                      cols: Math.max(1, Math.min(500, current.terminal.cols)),
                      rows: Math.max(1, Math.min(300, current.terminal.rows)),
                    }).catch((e) => onError(String(e)));
                  redraw((x) => x + 1);
                }
              }}
            />
          </label>
          <label>
            커서
            <select
              value={current.terminal.options.cursorStyle || "block"}
              onChange={(e) => {
                current.terminal.options.cursorStyle = e.target.value as
                  | "block"
                  | "underline"
                  | "bar";
                redraw((x) => x + 1);
              }}
            >
              <option value="block">블록</option>
              <option value="underline">밑줄</option>
              <option value="bar">막대</option>
            </select>
          </label>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={current.terminal.options.cursorBlink}
              onChange={(e) => {
                current.terminal.options.cursorBlink = e.target.checked;
                redraw((x) => x + 1);
              }}
            />
            커서 깜빡임
          </label>
          <div className="tools-row">
            <button
              onClick={() =>
                exportText("pterm-scrollback.txt", screenText(current)).catch(
                  (e) => onError(String(e)),
                )
              }
            >
              스크롤백 저장
            </button>
            <button
              onClick={() => {
                current.terminal.clear();
                setResult("스크롤백을 지웠습니다.");
              }}
            >
              스크롤백 지우기
            </button>
            <button
              onClick={() => {
                current.terminal.options.fontSize = 13;
                current.terminal.options.cursorStyle = "block";
                current.terminal.options.cursorBlink = true;
                current.fit.fit();
                if (isTauri())
                  void invoke("resize_terminal", {
                    id: current.id,
                    cols: Math.max(1, Math.min(500, current.terminal.cols)),
                    rows: Math.max(1, Math.min(300, current.terminal.rows)),
                  }).catch((e) => onError(String(e)));
                redraw((x) => x + 1);
              }}
            >
              기본값
            </button>
          </div>
          <p className="modal-description">
            화면 설정은 현재 세션에 적용됩니다.
          </p>
        </>
      )}
      {!current && page !== "compose" && (
        <p>터미널을 선택한 후 사용할 수 있습니다.</p>
      )}
    </Modal>,
    document.body,
  );
}
