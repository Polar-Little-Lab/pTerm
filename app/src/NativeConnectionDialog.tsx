import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Modal } from "./components";
import type { Host, Workspace } from "./types";
import {
  applyProfile,
  type NativeLaunch,
  type ProgramRequest,
  type AuthProfile,
} from "./native-connections";
const titles: Record<string, string> = {
  ssh: "고급 SSH",
  rdp: "원격 데스크톱",
  serial: "시리얼",
  python: "Python 스크립트",
  javascript: "JavaScript 스크립트",
  jxa: "macOS JavaScript",
  scp: "SCP 전송",
  ftp: "FTP / FTPS 전송",
  telnet: "Telnet",
  rlogin: "Rlogin",
};
export function NativeConnectionDialog({
  host,
  connected = false,
  onConnect,
  onEditHost,
  workspace,
  unlocked,
  onUpdate,
  onLaunch,
  onClose,
}: {
  host?: Host;
  connected?: boolean;
  onConnect?: (view: "terminal" | "files") => void;
  onEditHost?: () => void;
  workspace: Workspace;
  unlocked: boolean;
  onUpdate: (fn: (w: Workspace) => Workspace) => Promise<boolean>;
  onLaunch: (launch: NativeLaunch) => Promise<unknown>;
  onClose: () => void;
}) {
  const [advanced, setAdvanced] = useState(!host);
  const [mode, setMode] = useState("ssh"),
    [request, setRequest] = useState<ProgramRequest>({
      mode: "ssh",
      host: host?.host || "",
      port: host?.port || 22,
      username: host?.username || "",
      identity: host?.keyPath,
      tls: true,
    }),
    [serial, setSerial] = useState({
      path: "",
      baud: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      flow: "none",
    }),
    [ports, setPorts] = useState<string[]>([]),
    [profileId, setProfileId] = useState(""),
    [name, setName] = useState(""),
    [profileName, setProfileName] = useState(""),
    [args, setArgs] = useState("[]"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<{
      executable: string;
      args: string[];
    } | null>(null),
    [presetId, setPresetId] = useState(""),
    [editingProfile, setEditingProfile] = useState(false);
  useEffect(() => {
    if (isTauri() && mode === "serial")
      void invoke<string[]>("list_serial_ports")
        .then(setPorts)
        .catch((e) => setError(String(e)));
  }, [mode]);
  const change = (key: keyof ProgramRequest, value: unknown) => {
    setRequest((r) => ({ ...r, [key]: value }));
    setPreview(null);
  };
  const launch = (): NativeLaunch => {
    const extra = JSON.parse(args);
    if (!Array.isArray(extra) || !extra.every((v) => typeof v === "string"))
      throw new Error("인자는 JSON 문자열 배열로 입력하세요.");
    const profile = workspace.profiles?.find((p) => p.id === profileId);
    if (editingProfile)
      throw new Error("수정한 인증 프로필을 먼저 저장하세요.");
    if (profileId && !profile)
      throw new Error("인증 프로필이 삭제되었습니다. 다시 선택하세요.");
    return applyProfile(
      {
        program: { ...request, mode, args: extra },
        serial: mode === "serial" ? serial : undefined,
      },
      profile,
    );
  };
  async function choose(key: keyof ProgramRequest) {
    try {
      const file =
        key === "localPath" && !request.upload
          ? await save({ defaultPath: request.localPath })
          : await open({ multiple: false, directory: key === "cwd" });
      if (typeof file === "string") change(key, file);
    } catch (e) {
      setError(String(e));
    }
  }
  const field = (
    label: string,
    key: keyof ProgramRequest,
    placeholder = "",
  ) => (
    <label>
      {label}
      <div className="tools-row">
        <input
          style={{ flex: 1 }}
          value={String(request[key] || "")}
          placeholder={placeholder}
          disabled={
            !!profileId &&
            !editingProfile &&
            ["username", "identity", "certificate", "provider"].includes(key)
          }
          onChange={(e) => change(key, e.target.value)}
        />
        {[
          "executable",
          "script",
          "identity",
          "certificate",
          "provider",
          "config",
          "localPath",
          "cwd",
        ].includes(key) && (
          <button
            type="button"
            disabled={
              !!profileId &&
              !editingProfile &&
              ["identity", "certificate", "provider"].includes(key)
            }
            onClick={() => void choose(key)}
          >
            선택
          </button>
        )}
      </div>
    </label>
  );
  const network = ["ssh", "rdp", "scp", "ftp", "telnet", "rlogin"].includes(
      mode,
    ),
    script = ["python", "javascript", "jxa"].includes(mode),
    transfer = ["scp", "ftp"].includes(mode);
  async function saveProfile() {
    if (!profileName.trim()) return;
    const p: AuthProfile = {
      id: profileId || crypto.randomUUID(),
      name: profileName.trim(),
      username: request.username || "",
      identity: request.identity || "",
      certificate: request.certificate || "",
      provider: request.provider || "",
      gssapi: !!request.gssapi,
    };
    setBusy(true);
    try {
      if (
        await onUpdate((w) => ({
          ...w,
          profiles: [...(w.profiles || []).filter((x) => x.id !== p.id), p],
        }))
      ) {
        setProfileId(p.id);
        setEditingProfile(false);
        setPreview(null);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      className="native-connections"
      title={host ? host.name || host.host : "기타 연결·실행"}
      eyebrow={host ? "HOST CONNECTION" : "CONNECTION TOOLS"}
      busy={busy}
      onClose={onClose}
    >
      {host && <>
        <div className="host-connection-summary">
          <p className="host-connection-address">{host.username}@{host.host}:{host.port}</p>
          <dl><div><dt>인증</dt><dd>{host.authMethod === "key" ? "개인 키" : host.authMethod === "agent" ? "SSH Agent" : "비밀번호"}</dd></div>
          <div><dt>상태</dt><dd>{connected ? "연결된 세션 있음" : "연결 대기"}</dd></div>
          {host.group && <div><dt>그룹</dt><dd>{host.group}</dd></div>}
          {host.bastionHostId && <div><dt>경유 서버</dt><dd>{workspace.hosts.find(h => h.id === host.bastionHostId)?.name || "저장된 Bastion 경로"}</dd></div>}</dl>
          <p className="modal-description">SSH와 SFTP는 저장한 인증과 경유 경로를 함께 사용합니다. 이미 연결되어 있다면 다시 인증하지 않습니다.</p>
        </div>
        <div className="modal-actions host-connect-actions"><button onClick={onEditHost}>호스트 편집</button><button onClick={() => onConnect?.("files")}>SFTP 파일 전송</button><button className="primary" onClick={() => onConnect?.("terminal")}>{connected ? "SSH 터미널로 이동" : "SSH 터미널"}</button></div>
        <button className="connection-disclosure" aria-expanded={advanced} aria-controls="advanced-connection" disabled={busy} onClick={() => setAdvanced(!advanced)}><span>고급 연결·전송</span><span aria-hidden="true">{advanced ? "−" : "+"}</span></button>
      </>}
      {advanced && <div id="advanced-connection" className="advanced-connection">
      <div className="connection-fields">
      {host && <p className="modal-description">선택한 호스트의 주소를 가져왔습니다. 아래 작업은 별도 실행 엔진을 사용하며 기본 SSH 세션과 인증 저장소가 다릅니다.{host.bastionHostId && " 경유 서버는 점프 호스트에 별도로 지정하세요."}</p>}
      <label>
        저장한 연결
        <select
          value={presetId}
          onChange={(e) => {
            const p = workspace.connections?.find(
              (p) => p.id === e.target.value,
            );
            setPresetId(e.target.value);
            setPreview(null);
            setEditingProfile(false);
            if (!p) {
              setName("");
              setProfileId("");
              setProfileName("");
              setMode("ssh");
              setRequest({
                mode: "ssh",
                host: host?.host || "",
                port: host?.port || 22,
                username: host?.username || "",
                identity: host?.keyPath,
                tls: true,
              });
              setArgs("[]");
            }
            if (p) {
              setMode(p.launch.program.mode);
              setRequest(
                applyProfile(
                  p.launch,
                  workspace.profiles?.find(
                    (profile) => profile.id === p.profileId,
                  ),
                ).program,
              );
              setProfileName(
                workspace.profiles?.find(
                  (profile) => profile.id === p.profileId,
                )?.name || "",
              );
              if (p.launch.serial) setSerial(p.launch.serial);
              setArgs(JSON.stringify(p.launch.program.args || []));
              setName(p.name);
              setProfileId(p.profileId || "");
            }
          }}
        >
          <option value="">새 연결</option>
          {workspace.connections?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        방식
        <select
          value={mode}
          onChange={(e) => {
            const m = e.target.value;
            setMode(m);
            if (!["ssh", "scp"].includes(m)) {
              setProfileId("");
              setEditingProfile(false);
            }
            setRequest((r) => ({
              ...r,
              mode: m,
              port:
                m === "rdp"
                  ? 3389
                  : m === "ftp"
                    ? 21
                    : m === "telnet"
                      ? 23
                      : 22,
            }));
            setPreview(null);
          }}
        >
          {Object.entries(titles).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {mode === "serial" ? (
        <>
          <label>
            장치
            <select
              value={serial.path}
              onChange={(e) =>
                setSerial((s) => ({ ...s, path: e.target.value }))
              }
            >
              <option value="">장치 선택</option>
              {ports.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() =>
              void invoke<string[]>("list_serial_ports")
                .then(setPorts)
                .catch((e) => setError(String(e)))
            }
          >
            장치 다시 찾기
          </button>
          <div className="form-row">
            <label>
              속도
              <select
                value={serial.baud}
                onChange={(e) =>
                  setSerial((s) => ({ ...s, baud: Number(e.target.value) }))
                }
              >
                {[
                  1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400,
                ].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              데이터 비트
              <select
                value={serial.dataBits}
                onChange={(e) =>
                  setSerial((s) => ({ ...s, dataBits: Number(e.target.value) }))
                }
              >
                <option>7</option>
                <option>8</option>
              </select>
            </label>
            <label>
              정지 비트
              <select
                value={serial.stopBits}
                onChange={(e) =>
                  setSerial((s) => ({ ...s, stopBits: Number(e.target.value) }))
                }
              >
                <option>1</option>
                <option>2</option>
              </select>
            </label>
          </div>
          <label>
            패리티
            <select
              value={serial.parity}
              onChange={(e) =>
                setSerial((s) => ({ ...s, parity: e.target.value }))
              }
            >
              <option value="none">없음</option>
              <option value="even">짝수</option>
              <option value="odd">홀수</option>
            </select>
          </label>
          <label>
            흐름 제어
            <select
              value={serial.flow}
              onChange={(e) =>
                setSerial((s) => ({ ...s, flow: e.target.value }))
              }
            >
              <option value="none">없음</option>
              <option value="software">XON/XOFF</option>
              <option value="hardware">RTS/CTS</option>
            </select>
          </label>
        </>
      ) : (
        <>
          {network && (
            <>
              {field("호스트", "host", "server.example.com")}
              <div className="form-row">
                <label>
                  포트
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={request.port || ""}
                    onChange={(e) => change("port", Number(e.target.value))}
                  />
                </label>
                {field("사용자 이름", "username")}
              </div>
            </>
          )}
          {["ssh", "scp"].includes(mode) && (
            <>
              <label>
                인증 프로필
                <select
                  value={profileId}
                  onChange={(e) => {
                    setProfileId(e.target.value);
                    setEditingProfile(false);
                    setPreview(null);
                    const p = workspace.profiles?.find(
                      (p) => p.id === e.target.value,
                    );
                    if (p) setProfileName(p.name);
                    if (p)
                      setRequest((r) => ({
                        ...r,
                        username: p.username,
                        identity: p.identity,
                        certificate: p.certificate,
                        provider: p.provider,
                        gssapi: p.gssapi,
                      }));
                  }}
                >
                  <option value="">직접 설정</option>
                  {workspace.profiles?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {field("개인 키", "identity")}
              {field("점프 호스트", "jump", "user@bastion:22")}
            </>
          )}
          {mode === "ssh" && (
            <details>
              <summary>고급 인증·포워딩</summary>
              {field("OpenSSH 인증서", "certificate")}
              {field("PKCS#11 공급자 라이브러리", "provider")}
              {field("OpenSSH config 파일", "config")}
              <label className="check-inline">
                <input
                  type="checkbox"
                  disabled={!!profileId && !editingProfile}
                  checked={!!request.gssapi}
                  onChange={(e) => change("gssapi", e.target.checked)}
                />
                Kerberos / GSSAPI
              </label>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={!!request.agentForwarding}
                  onChange={(e) => change("agentForwarding", e.target.checked)}
                />
                SSH Agent 포워딩
              </label>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={!!request.x11}
                  onChange={(e) => change("x11", e.target.checked)}
                />
                X11 포워딩 · XQuartz 필요
              </label>
              <p className="modal-description">
                macOS OpenSSH에서 인증하며 비밀번호·PIN·서버 지문 확인은 새
                터미널에서 진행합니다. pTerm 기본 SSH의 키 저장소와 별개로
                OpenSSH known_hosts를 사용합니다.
              </p>
            </details>
          )}
          {mode === "rdp" && (
            <p className="modal-description">
              FreeRDP의 별도 데스크톱 창이 열립니다. SDL FreeRDP 또는 MacFreeRDP
              실행 엔진이 필요합니다. 비밀번호와 서버 인증서 확인은 실행
              엔진에서 처리하며 pTerm에 저장하지 않습니다.
            </p>
          )}
          {script && (
            <>
              {field("스크립트 파일", "script")}
              <label>
                인자 · JSON 배열
                <input
                  value={args}
                  onChange={(e) => {
                    setArgs(e.target.value);
                    setPreview(null);
                  }}
                  placeholder='["server", "dev"]'
                />
              </label>
              {field("작업 폴더", "cwd")}
              <p className="modal-description">
                스크립트는 선택한 로컬 실행 엔진에서 실행됩니다. Python은
                python3, JavaScript는 Node.js, macOS JavaScript는 JXA를
                사용합니다. Windows VBScript/WSH API는 macOS에서 실행하지
                않습니다.
              </p>
            </>
          )}
          {transfer && (
            <>
              <label>
                방향
                <select
                  value={request.upload ? "upload" : "download"}
                  onChange={(e) =>
                    change("upload", e.target.value === "upload")
                  }
                >
                  <option value="download">다운로드</option>
                  <option value="upload">업로드</option>
                </select>
              </label>
              {field("로컬 파일 절대 경로", "localPath")}
              {field("원격 파일 절대 경로", "remotePath")}
              {mode === "ftp" && (
                <label className="check-inline">
                  <input
                    type="checkbox"
                    checked={request.tls !== false}
                    onChange={(e) => change("tls", e.target.checked)}
                  />
                  TLS 필수 (FTPS)
                </label>
              )}
              <p className="modal-description">
                같은 이름의 대상 파일은 덮어쓸 수 있습니다. 전송 전 경로를
                확인하세요. 비밀번호는 새 터미널에서 입력합니다.
              </p>
            </>
          )}
          <details>
            <summary>실행 엔진 지정</summary>
            {field("실행 파일 절대 경로 · 비우면 자동 탐색", "executable")}
            <p>
              OpenSSH/SCP/curl은 macOS 기본 도구를 사용합니다.
              FreeRDP·Python·Node·Telnet·Rlogin은 설치된 실행 파일을 선택할 수
              있습니다.
            </p>
          </details>
        </>
      )}
      <details className="connection-save"><summary>연결 저장·인증 프로필 관리</summary>
      {mode === "ssh" && (
        <label>
          인증 프로필 이름
          <input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="예: 운영 서버 인증"
          />
        </label>
      )}
      <label>
        연결 이름
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="tools-row">
        <button
          disabled={!unlocked || !name.trim() || busy}
          onClick={async () => {
            setError("");
            try {
              const value = {
                program: { ...request, mode, args: launch().program.args },
                serial: mode === "serial" ? serial : undefined,
              };
              const id = presetId || crypto.randomUUID();
              if (
                await onUpdate((w) => ({
                  ...w,
                  connections: [
                    ...(w.connections || []).filter((p) => p.id !== id),
                    {
                      id,
                      name: name.trim(),
                      launch: value,
                      profileId: profileId || undefined,
                    },
                  ],
                }))
              )
                setPresetId(id);
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          연결 저장
        </button>
        {mode === "ssh" && (
          <button
            disabled={!unlocked || !profileName.trim() || busy}
            onClick={() => void saveProfile().catch((e) => setError(String(e)))}
          >
            인증 프로필 저장
          </button>
        )}
        {profileId && (
          <button
            onClick={() => {
              setEditingProfile(true);
              setProfileName(
                workspace.profiles?.find((p) => p.id === profileId)?.name || "",
              );
              setPreview(null);
            }}
          >
            프로필 설정 수정
          </button>
        )}
        {profileId && (
          <button
            disabled={
              busy ||
              !unlocked ||
              workspace.connections?.some((c) => c.profileId === profileId)
            }
            title="사용 중인 프로필은 연결에서 직접 설정으로 바꾼 뒤 삭제할 수 있습니다."
            onClick={async () => {
              if (
                await onUpdate((w) => ({
                  ...w,
                  profiles: w.profiles?.filter((p) => p.id !== profileId),
                }))
              ) {
                setProfileId("");
                setEditingProfile(false);
                setPreview(null);
              }
            }}
          >
            미사용 프로필 삭제
          </button>
        )}
        {presetId && (
          <button
            disabled={busy}
            onClick={async () => {
              if (
                await onUpdate((w) => ({
                  ...w,
                  connections: w.connections?.filter((p) => p.id !== presetId),
                }))
              )
                setPresetId("");
            }}
          >
            저장한 연결 삭제
          </button>
        )}
      </div>
      {!unlocked && (
        <p>연결·인증 프로필을 저장하려면 먼저 저장소를 잠금 해제하세요.</p>
      )}
      </details>
      {preview && (
        <pre className="tools-output">
          {preview.executable}
          {"\n"}
          {preview.args.map((a) => JSON.stringify(a)).join(" ")}
        </pre>
      )}
      {error && <p role="alert">{error}</p>}
      </div>
      <div className="modal-actions">
        <button onClick={onClose} disabled={busy}>
          취소
        </button>
        <button
          className="primary"
          disabled={busy || !isTauri() || (mode === "serial" && !serial.path)}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const value = launch();
              if (mode !== "serial" && !preview) {
                setPreview(
                  await invoke("preview_program", { request: value.program }),
                );
              } else {
                await onLaunch(value);
                onClose();
              }
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "처리 중…"
            : preview || mode === "serial"
              ? "연결·실행"
              : "설정 확인"}
        </button>
      </div>
      </div>}
    </Modal>
  );
}
