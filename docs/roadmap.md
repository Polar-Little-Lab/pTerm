# 단계별 개발 로드맵

**현재 0.5.0:** [탭 드래그·다중 분할](https://github.com/Polar-Little-Lab/polarsh/blob/main/docs/release-0.5.0.md). 좌우/상하 2분할, 3분할, 4분할, 영역 확대·복원과 세션 유지 재배치를 구현했다. 후속 UI 범위는 분할 비율 조절·배치 저장이다.

**현재 0.4:** [Polar Terminal 로컬+SSH](https://github.com/Polar-Little-Lab/polarsh/blob/main/docs/release-0.4.md). Vault 없이 로컬 로그인 셸, 시작 폴더·셸 선택, LOCAL/SSH 탭 및 혼합 분할을 추가했다. 로컬 셸 통합·프로필·현재 경로 추적은 다음 로컬 개선 범위다.

**현재 0.3:** [호스트 일괄 관리·Bastion·화면 분할](https://github.com/Polar-Little-Lab/polarsh/blob/main/docs/release-0.3.md)을 구현했다. Vault/Keychain/Touch ID, 그룹·태그·즐겨찾기, 저장 명령, SFTP에 더해 다중 선택 삭제·그룹 이동·호스트 복제, 활성 Bastion 경유 SSH/SFTP, 두 터미널 좌우 분할을 지원한다. 다음 우선순위는 SSH Agent → Port Forwarding → 자동 재연결·가져오기/내보내기 → 로그·Workspace·Broadcast다. sync/AI/협업은 후속 서비스 단계다.

2026-10-24. 후속 요청으로 앱 개발에 착수했다. Rust 1.99.1 설치, Harbor SSH 개발 앱 빌드, 실제 SSH 통합 테스트 7개를 완료했다. 아래 소요는 계획 추정이다. [현재 구현과 검증](development-status.md).

| 단계 | 예상 | 산출물 | 통과 조건 |
|---|---|---|---|
| 0. 환경·분석·설계 | 완료 | REA 설치, MCP 등록, 분석 로그, 문서 | 실제 Codex tools/call 성공까지 확인 |
| 0b. 조사 보강 | 필요 시 | 세부 요금제/미확인 기능 보강 | 공식 근거와 런타임 확인 구별 |
| 1. 기술 spike | 1~2주 | Rust stable ≥1.90, Tauri 2 skeleton, xterm 입력/출력, russh/SFTP test harness | WKWebView IME/resize/대량 출력; OpenSSH test server 인증·host-key mismatch·취소 통과 |
| 2. 안전한 로컬 MVP | 3~5주 | Hosts/Groups/Tags, Vault/Keychain, SSH 탭, key/password/MFA | 디스크/로그 비밀 누출 없음, DB migration/복구, 세션별 오류 격리 |
| 3. 일상 사용 기능 | 3~5주 | Split, agent, jump, forwarding, SFTP, import/export | 중첩 host-key 검증, transfer cancel/overwrite/symlink, 끊김·sleep/wake 시험 |
| 4. 생산성 | 2~4주 | Snippets, Workspace, Broadcast, 암호화 로그/검색 | 대상 오입력 방지, 명령 replay 정책, 로그 retention/delete, 긴 출력 안정성 |
| 5. 성능·출시 품질 | 2~4주 | Instruments profile, benchmark, 접근성, 서명·공증·업데이트 | architecture.md 성능 목표 검토, 8시간 soak, arm64 배포 검증, rollback/서명 검증 |
| 6. 기기 동기화 | 4~8주 이상 | 독립 sync service, E2EE, device/recovery UI | threat model·키 회전·폐기·충돌·복구 테스트와 외부 보안 검토 |
| 7. AI·협업 | 4~8주 이상 | opt-in AI adapter, read-only 공유부터 live collaboration | 컨텍스트 최소화, 명시적 실행, 권한 취소·감사·team key distribution 검증 |

단계 1은 진행 중이다. 실제 SSH 엔진과 UI를 구현했으며 OpenSSH 상호운용 및 native 입력/부하 검증은 남아 있다. REA 분석을 앱 build dependency로 넣지 않는다. Termius 독점 코드/리소스를 가져오지 않는다.

## 다음 개발 착수 시 결정할 것

1. `russh 0.64.1 + russh-sftp 3.0.1` 조합의 실제 compatibility, crypto backend, Rust toolchain을 검증해 lockfile 고정.
2. 키보드/IME, emoji/wide character, tmux/vim, terminal resize를 WKWebView에서 먼저 검증.
3. `HostKeyPolicy`, `VaultService`, `SessionManager`, typed IPC 계약을 코드보다 먼저 확정.
4. synthetic server fixture만 사용하며 기존 Termius 계정/키/자격증명으로 테스트하지 않음.
5. 첫 release는 macOS arm64/local-only. Intel·모바일·클라우드 계정은 후속 범위로 추적.

## 미완료와 이유

- **Codex MCP 실제 호출:** 후속 자동 승인 검토에서 해결. 실제 open_binary 및 선택 JS 분석 응답을 확보했다.
- **대형 JS 전체 의미 분석:** 1 GiB worker heap 소진. 작은 파일 분석은 성공했다. 필요할 때 공개 요구사항으로 답할 수 없는 구체적 질문에 한해 범위/자원 한도를 재설정한다.
- **네이티브 decompile:** 초기 목표에 필수 아님. Ghidra/JDK를 추가 설치하지 않았다.
- **일부 기능의 세부 Starter/Pro 및 실제 UI 동작:** 공식 텍스트의 체크 아이콘 소실, 일부 문서 403, 런타임 미실행. feature-matrix의 미확정 표기를 유지한다.
- **성능 개선 검증:** 개발 앱은 있으나 동등 조건 benchmark를 수행하지 않았다.
- **제품 기능(0.3 기준):** Vault/Keychain·Touch ID, 기본 SFTP, 활성 Bastion 경유 SSH/SFTP, 두 패널 분할은 구현했다. SSH Agent, 독립 로컬/원격 forwarding, 자동 재연결, import/export, 로그·Broadcast·서비스 기능은 남아 있다.

## 완료 점검 기록

- REA 6.7.0 설치 및 전용 Node 24.22.1 사용.
- 기존 MCP 7개 객체 전후 동일, `rea`만 추가.
- 최종 scoped doctor 정상; MCP initialize 6.7.0 및 tools/list 207개.
- 실제 CLI `inspect-artifact` 및 선택 JS 분석 결과 확보.
- target inventory/mtime/size 및 주요 SHA-256 전후 동일.
- 세션 로그에 승인 차단과 메모리 제한을 숨기지 않고 남김.
- Harbor SSH 개발 앱 생성, 통합 테스트 7개 통과. 다음은 OpenSSH/WKWebView 검증과 Vault/Keychain, 이후 SFTP.
