import { ScriptTools } from "./ScriptTools";
import { useEffect, useRef, useState } from "react";
import type { Session } from "./types";
import { captureFor, exportText } from "./terminal-tools";
import { parseSteps, runSteps } from "./automation";
export function AutomationTools({ current }: { current?: Session }) {
  const [script, setScript] = useState(
      '[\n  {"send": "echo ready\\n"},\n  {"expect": "ready", "timeout": 10000}\n]',
    ),
    [busy, setBusy] = useState(false),
    [scriptBusy, setScriptBusy] = useState(false),
    [review, setReview] = useState(false),
    [status, setStatus] = useState(""),
    [key, setKey] = useState("KeyH"),
    [command, setCommand] = useState(""),
    [, redraw] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    controller.current?.abort();
    setReview(false);
    setStatus("");
  }, [current?.id]);
  if (!current) return <p>터미널을 선택하세요.</p>;
  const state = captureFor(current);
  async function run() {
    if (!current) return;
    try {
      const steps = parseSteps(script);
      if (!review) {
        setReview(true);
        setStatus(
          `${current.host.name || current.host.host}에서 ${steps.length}개 단계를 실행합니다.`,
        );
        return;
      }
      const abort = new AbortController();
      controller.current = abort;
      setBusy(true);
      await runSteps(current, steps, abort.signal, (index) =>
        setStatus(`${index + 1} / ${steps.length} 단계 실행 중`),
      );
      setStatus(
        "시나리오 입력 처리를 마쳤습니다. 명령 성공 여부는 서버 출력을 확인하세요.",
      );
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
      if (review) setReview(false);
    }
  }
  return (
    <>
      <p className="modal-description">
        JSON 시나리오: send(문자열 전송), wait(밀리초), expect(출력 대기)를
        지원합니다. 이 화면을 닫으면 실행을 중지합니다.
      </p>
      <textarea
        aria-label="자동화 시나리오"
        className="tools-editor"
        value={script}
        disabled={busy}
        onChange={(e) => {
          setScript(e.target.value);
          setReview(false);
        }}
        spellCheck={false}
      />
      <div className="tools-row">
        <button
          disabled={
            busy ||
            scriptBusy ||
            current.closed ||
            current.status !== "connected"
          }
          onClick={() => void run()}
        >
          {review ? "확인한 시나리오 실행" : "실행 내용 확인"}
        </button>
        <button disabled={!busy} onClick={() => controller.current?.abort()}>
          중지
        </button>
        <button
          onClick={() =>
            exportText("pterm-scenario.json", script, "application/json").catch(
              (e) => setStatus(String(e)),
            )
          }
        >
          시나리오 저장
        </button>
      </div>
      <p role="status">{status}</p>
      <ScriptTools
        key={current.id}
        current={current}
        disabled={busy}
        onBusy={setScriptBusy}
      />
      <details>
        <summary>입력 기록으로 시나리오 만들기</summary>
        <p>
          기록 중에는 비밀번호를 포함한 모든 터미널 입력이 메모리에 남습니다.
          기록 후 내용을 검토하세요. 최대 200개 입력이며 세션 종료 시
          사라집니다.
        </p>
        <div className="tools-row">
          <button
            aria-pressed={state.inputRecording}
            onClick={() => {
              state.inputRecording = !state.inputRecording;
              redraw((x) => x + 1);
            }}
          >
            {state.inputRecording ? "입력 기록 중지" : "입력 기록 시작"}
          </button>
          <button
            disabled={busy}
            onClick={() => {
              state.inputRecording = false;
              setScript(
                JSON.stringify(
                  state.recordedInput.map((send) => ({ send })),
                  null,
                  2,
                ),
              );
              setReview(false);
              redraw((x) => x + 1);
            }}
          >
            기록을 편집기로 불러오기
          </button>
          <button
            onClick={() => {
              state.inputRecording = false;
              state.recordedInput = [];
              redraw((x) => x + 1);
            }}
          >
            기록 지우기
          </button>
        </div>
      </details>
      <details>
        <summary>세션 단축키</summary>
        <p>
          Ctrl + Option + 선택한 키로 문자열을 전송합니다. 줄바꿈을 포함하면
          실행될 수 있습니다.
        </p>
        <label>
          키
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((k) => (
              <option key={k} value={"Key" + k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label>
          전송 문자열
          <textarea
            value={command}
            maxLength={16384}
            onChange={(e) => setCommand(e.target.value)}
          />
        </label>
        <button
          disabled={!command}
          onClick={() => {
            state.bindings[key] = command;
            setCommand("");
            redraw((x) => x + 1);
          }}
        >
          단축키 저장
        </button>
        {Object.entries(state.bindings).map(([code, value]) => (
          <div className="tools-row" key={code}>
            <span>
              Ctrl + Option + {code.slice(3)} · {value.slice(0, 60)}
            </span>
            <button
              onClick={() => {
                delete state.bindings[code];
                redraw((x) => x + 1);
              }}
            >
              삭제
            </button>
          </div>
        ))}
      </details>
    </>
  );
}
