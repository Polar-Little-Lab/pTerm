import { useState } from "react";
import { Modal } from "./components";
import { exportText } from "./terminal-tools";
import {
  mergePortable,
  parsePortable,
  portableWorkspace,
  type PortableWorkspace,
} from "./workspace-transfer";
import type { Workspace } from "./types";
export function WorkspaceTransfer({
  workspace,
  onImport,
  onClose,
}: {
  workspace: Workspace;
  onImport: (transform: (w: Workspace) => Workspace) => Promise<boolean>;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<PortableWorkspace | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="연결·저장 명령 이전"
      eyebrow="IMPORT / EXPORT"
      onClose={onClose}
      busy={busy}
    >
      <p className="modal-description">
        비밀번호와 서버 지문은 내보내지 않습니다. 호스트 주소·사용자 이름·키
        경로·저장 명령·인증 프로필·외부 실행 설정은 JSON 파일에 포함됩니다. 저장
        명령에 직접 넣은 비밀 값은 먼저 제거하세요. 호스트의 상속 설정은 적용된 값으로 포함되며, 가져온 호스트의 직접 설정으로 저장됩니다. 기본값과 다른 호스트의 설정은 바꾸지 않습니다. 자동 로그 설정이 포함된 경우 저장 폴더도 확인하세요.
      </p>
      <button
        onClick={() =>
          exportText(
            "pterm-connections.json",
            JSON.stringify(portableWorkspace(workspace), null, 2),
            "application/json",
          ).catch((e) => setError(String(e)))
        }
      >
        JSON 내보내기
      </button>
      <label>
        pTerm JSON 가져오기
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setPreview(null);
            setError("");
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
              setError("최대 2 MiB 파일을 선택하세요.");
              return;
            }
            try {
              setPreview(parsePortable(await file.text()));
            } catch (error) {
              setError(String(error));
            }
          }}
        />
      </label>
      {preview && (
        <>
          <p>
            호스트 {preview.hosts.length}개 · 저장 명령{" "}
            {preview.snippets.length}개 · 인증 프로필{" "}
            {preview.profiles?.length || 0}개 · 연결{" "}
            {preview.connections?.length || 0}개를 새 항목으로 추가합니다. 기존
            항목은 유지됩니다.
          </p>
          <ul style={{ maxHeight: 160, overflow: "auto" }}>
            {preview.hosts.slice(0, 30).map((h) => (
              <li key={h.id}>
                {h.name || h.host} · {h.username}@{h.host}:{h.port}
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="modal-actions">
        <button disabled={busy} onClick={onClose}>
          닫기
        </button>
        <button
          className="primary"
          disabled={!preview || busy}
          onClick={async () => {
            if (!preview) return;
            setBusy(true);
            try {
              if (await onImport((w) => mergePortable(w, preview))) onClose();
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          확인한 항목 추가
        </button>
      </div>
    </Modal>
  );
}
