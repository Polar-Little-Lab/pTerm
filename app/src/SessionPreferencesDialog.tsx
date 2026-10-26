import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@tauri-apps/api/core";
import { Modal } from "./components";
import type { Workspace } from "./types";
import {
  defaults,
  resolvePreferences,
  validPreferences,
  type SessionPreferences,
  preferenceKeys,
} from "./session-preferences";
const labels: Record<keyof SessionPreferences, string> = {
  startupEnabled: "SSH 연결 직후 명령 실행",
  startupCommand: "연결 직후 실행할 명령",
  fontSize: "글꼴 크기",
  fontFamily: "글꼴 목록",
  lineHeight: "줄 높이",
  scrollback: "스크롤백 줄 수",
  cursorStyle: "커서 모양",
  cursorBlink: "커서 깜빡임",
  closeProtected: "닫기 보호",
  logEnabled: "연결 시 파일 기록 시작",
  logDirectory: "로그 저장 폴더",
  logMaxMiB: "로그 파일당 최대 크기 (MiB)",
  logFiles: "현재 기록의 보존 파일 수",
  logTimestamps: "수신 청크별 시각 기록",
};
export function SessionPreferencesDialog({
  workspace,
  onSave,
  onClose,
}: {
  workspace: Workspace;
  onSave: (fn: (w: Workspace) => Workspace) => Promise<boolean>;
  onClose: () => void;
}) {
  const [scope, setScope] = useState("defaults"),
    [group, setGroup] = useState(
      workspace.hosts.find((h) => h.group)?.group || "",
    ),
    [hostId, setHostId] = useState(workspace.hosts[0]?.id || ""),
    [draft, setDraft] = useState<SessionPreferences>({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const host = workspace.hosts.find((h) => h.id === hostId);
  useEffect(() => {
    setDraft(
      scope === "defaults"
        ? workspace.sessionDefaults || {}
        : scope === "group"
          ? Object.hasOwn(workspace.groupPreferences || {}, group)
            ? workspace.groupPreferences![group]
            : {}
          : host?.preferences || {},
    );
    setMessage("");
  }, [scope, group, hostId, workspace]);
  const inherited =
    scope === "defaults"
      ? defaults
      : scope === "group"
        ? resolvePreferences({ sessionDefaults: workspace.sessionDefaults })
        : resolvePreferences(
            workspace,
            host ? { ...host, preferences: undefined } : undefined,
          );
  const effective = { ...inherited, ...draft };
  const change = (key: keyof SessionPreferences, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const render = (key: keyof SessionPreferences) => {
    const own = draft[key] !== undefined,
      value = effective[key];
    return (
      <div className="preference-row" key={key}>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={own}
            onChange={(e) => {
              if (e.target.checked) change(key, inherited[key]);
              else
                setDraft((d) => {
                  const next = { ...d };
                  delete next[key];
                  return next;
                });
            }}
          />
          {labels[key]} <small>{own ? "직접 설정" : "상속 중"}</small>
        </label>
        {key === "startupCommand" ? (
          <textarea
            aria-label={labels[key]}
            disabled={!own}
            value={String(value)}
            maxLength={4096}
            onChange={(e) => change(key, e.target.value)}
          />
        ) : typeof value === "boolean" ? (
          <label className="check-inline">
            <input
              type="checkbox"
              disabled={!own}
              checked={value}
              onChange={(e) => change(key, e.target.checked)}
            />
            사용
          </label>
        ) : key === "cursorStyle" ? (
          <select
            aria-label={labels[key]}
            disabled={!own}
            value={String(value)}
            onChange={(e) => change(key, e.target.value)}
          >
            <option value="block">블록</option>
            <option value="underline">밑줄</option>
            <option value="bar">막대</option>
          </select>
        ) : (
          <div className="tools-row">
            <input
              aria-label={labels[key]}
              disabled={!own}
              type={typeof value === "number" ? "number" : "text"}
              step={key === "lineHeight" ? 0.1 : 1}
              value={value}
              onChange={(e) =>
                change(
                  key,
                  typeof value === "number"
                    ? Number(e.target.value)
                    : e.target.value,
                )
              }
            />
            {key === "logDirectory" && (
              <button
                disabled={!own || !isTauri()}
                onClick={() =>
                  void open({ directory: true, multiple: false })
                    .then((path) => {
                      if (typeof path === "string") change(key, path);
                    })
                    .catch((e) => setMessage(String(e)))
                }
              >
                폴더 선택
              </button>
            )}
          </div>
        )}
      </div>
    );
  };
  return (
    <Modal
      className="native-connections"
      title="세션 기본값·상속"
      eyebrow="SESSION PREFERENCES"
      busy={busy}
      onClose={onClose}
    >
      <p className="modal-description">
        기본값 → 호스트 그룹 → 개별 호스트 순서로 적용합니다. 체크를 해제한
        항목은 상위 설정을 따릅니다. 저장 후 새로 연결하는 세션부터 적용됩니다.
        로컬·외부 엔진 연결은 기본값을 사용합니다.
      </p>
      <label>
        설정 범위
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="defaults">전체 기본값</option>
          <option value="group">호스트 그룹</option>
          <option value="host">개별 호스트</option>
        </select>
      </label>
      {scope === "group" && (
        <label>
          그룹 이름
          <input
            list="preference-groups"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          />
          <datalist id="preference-groups">
            {[
              ...new Set([
                ...workspace.hosts.map((h) => h.group).filter(Boolean),
                ...Object.keys(workspace.groupPreferences || {}),
              ]),
            ].map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
      )}
      {scope === "host" && (
        <label>
          호스트
          <select value={hostId} onChange={(e) => setHostId(e.target.value)}>
            {workspace.hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name || h.host}
                {h.group ? ` · ${h.group}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <fieldset>
        <legend>화면·입력</legend>
        {preferenceKeys
          .filter((k) => !k.startsWith("log") && !k.startsWith("startup"))
          .map(render)}
      </fieldset>
      <details>
        <summary>SSH 연결 후 자동 명령</summary>
        <p>
          기본 SSH 연결이 완료되면 이 명령을 한 번 전송하고 마지막에 Enter를
          추가합니다. 재연결 시에도 실행됩니다. 그룹·전체 기본값에 설정하면 해당
          범위의 모든 SSH 호스트에 적용됩니다. 비밀번호는 넣지 마세요. 외부
          SSH·로컬·시리얼에는 적용하지 않습니다.
        </p>
        {preferenceKeys.filter((k) => k.startsWith("startup")).map(render)}
      </details>
      <details>
        <summary>파일 기록·용량 제한</summary>
        <p>
          로그는 선택한 폴더에 평문으로 저장되며 서버가 출력한 민감한 정보가
          포함될 수 있습니다. 현재 기록의 파일만 회전하며, 이전 연결의 로그
          폴더는 자동 삭제하지 않습니다. 앱 시작 시 저장소를 열기 전의 첫 로컬
          셸에는 적용되지 않습니다.
        </p>
        {preferenceKeys.filter((k) => k.startsWith("log")).map(render)}
      </details>
      <p role="status">{message}</p>
      <div className="modal-actions">
        <button disabled={busy} onClick={() => setDraft({})}>
          모두 상속으로 되돌리기
        </button>
        <button
          className="primary"
          disabled={
            busy ||
            (scope === "host" && !host) ||
            (scope === "group" && !group.trim())
          }
          onClick={async () => {
            if (!validPreferences(draft)) {
              setMessage(
                "설정 범위를 확인하세요: 글꼴 9–32, 줄 높이 1–2, 스크롤백 0–100000, 파일 1–100 MiB, 보존 1–100개.",
              );
              return;
            }
            if (effective.startupEnabled && !effective.startupCommand.trim()) {
              setMessage("연결 후 실행할 명령을 입력하세요.");
              return;
            }
            if (effective.logEnabled && !effective.logDirectory) {
              setMessage("자동 기록을 켜려면 로그 저장 폴더를 지정하세요.");
              return;
            }
            setBusy(true);
            try {
              const ok = await onSave((w) =>
                scope === "defaults"
                  ? { ...w, sessionDefaults: draft }
                  : scope === "group"
                    ? {
                        ...w,
                        groupPreferences: {
                          ...w.groupPreferences,
                          [group.trim()]: draft,
                        },
                      }
                    : {
                        ...w,
                        hosts: w.hosts.map((h) =>
                          h.id === hostId ? { ...h, preferences: draft } : h,
                        ),
                      },
              );
              setMessage(
                ok
                  ? "저장했습니다. 다음 연결부터 적용됩니다."
                  : "설정을 저장하지 못했습니다.",
              );
            } catch (e) {
              setMessage(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          설정 저장
        </button>
      </div>
    </Modal>
  );
}
