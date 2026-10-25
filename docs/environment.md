# 실제 개발 환경 및 설치 결과

확인일: 2026-10-24 (Asia/Seoul). 작업 위치: `/Users/polar/Desktop/reverse-engineering`.
후속 앱 개발 요청에 따라 Harbor SSH를 구현하고 macOS 개발 앱을 빌드했다. 최신 구현·검증 기록은 [개발 현황](development-status.md)을 참고한다.

| 항목 | 실제 확인 결과 | 이번 변경 |
|---|---|---|
| macOS | 26.6.2, build 25G83 | 없음 |
| CPU / 메모리 | arm64, Apple Silicon / 32 GiB | 없음 |
| 기존 Node.js | v26.5.0, `/opt/homebrew/bin/node` | 유지 |
| npm | 11.17.0 | 유지 |
| Python | 3.9.6, `/usr/bin/python3` | 유지 |
| Rust / Cargo | rustc / cargo 1.99.1, `~/.cargo/bin` | rustup minimal 및 rustfmt/clippy 설치, 셸 시작 파일 유지 |
| Homebrew | 7.0.10-84-g7a056ff | 유지 |
| Xcode CLI Tools | `/Library/Developer/CommandLineTools` | 기존 설치 사용 |
| Codex CLI | 0.164.0 | 유지 |
| REA | `rea-agents` 6.7.0 | 프로젝트 `.tools/rea`에 설치 |
| REA 전용 Node | 24.22.1 | `.tools/runtime`에 격리 설치 |
| ASAR 도구 | `@electron/asar` 4.2.0 | REA 의존성으로 설치 |
| Termius | 10.2.1, `/Applications/Termius.app` | 읽기만 수행 |
| Ghidra / Hopper / IDA | REA에 사용 가능한 provider 미등록 | 초기 JS/번들 분석에는 불필요 |

실행 로그: environment.json (`../logs/environment.json` · 이전 개발 환경의 로컬 기록, 저장소 미포함), runtime-install.log (`../logs/runtime-install.log` · 이전 개발 환경의 로컬 기록, 저장소 미포함), rea-install.log (`../logs/rea-install.log` · 이전 개발 환경의 로컬 기록, 저장소 미포함).

## 설치 판단과 영향

[REA 공식 README](https://github.com/morluto/rea)는 현재 Node 22.23.4+, 24.22.1+, 26.12.1+의 해당 지원 계열을 요구한다. 반면 npm 6.7.0의 `engines` 필드는 더 느슨하다. 두 자료가 다르므로 더 엄격한 문서 조건을 충족하는 Node 24.22.1을 선택했다. 기존 Node·npm·Homebrew나 셸 시작 파일을 업그레이드하지 않았다.

프로젝트의 `scripts/rea`는 전용 Node와 REA 진입점을 사용한다. Codex에는 REA 공식 setup이 선택한 로컬 실행 경로와 전용 Node PATH를 등록했다. 따라서 프로젝트를 이동하거나 `.tools`를 제거하면 MCP 경로를 재등록해야 한다. 이 설치는 시스템 전역 `rea` 명령을 추가하지 않는다.

## 검증 기준 결과

| 기준 | 결과 | 증거 / 제한 |
|---|---|---|
| REA 실제 설치 | 통과 | 6.7.0 버전, CLI 정적 분석 완료 |
| Codex MCP 등록·연결 | 등록 통과, 도구 발견 확인 | scoped doctor 정상, Codex가 `rea` 도구 호출 항목 생성, 직접 MCP initialize 및 tools/list 207개 확인 |
| Codex를 통한 실제 도구 실행 | 통과 | 후속 자동 승인 검토에서 open_binary 및 선택 JS 분석 실제 응답 확인. 초기 승인 실패도 로그 보존 |
| Termius 읽기 전용 구조 분석 | 통과, 제한 명시 | 번들 및 ASAR 인벤토리, 작은 JS 2개 AST 분석 |
| 분석·실행 기록 | 완료 | `logs/` 및 문서 6개 |
| 설계·로드맵 | 완료 | architecture.md, roadmap.md |

설치 성공이나 doctor 결과를 실제 Codex 도구 실행 성공으로 간주하지 않았다. MCP handshake 검증 역시 tools/call 성공과 구별한다.

기존 MCP 7개(`chrome-devtools`, `computer-use`, `context7`, `cua_repl`, `node_repl`, `openaiDeveloperDocs`, `playwright`)의 등록 객체가 전후 동일하다. 비교 결과 (`../logs/mcp-preservation.json` · 이전 개발 환경의 로컬 기록, 저장소 미포함).

사용자 설정·계정·SSH 키·Keychain 항목·저장 자격증명은 읽거나 변경하지 않았다. 앱 번들 일반 파일의 크기/mtime 목록과 Info.plist·실행 파일·ASAR의 SHA-256이 전후 동일하다. 읽기 전용 검증 (`../logs/readonly-verification.json` · 이전 개발 환경의 로컬 기록, 저장소 미포함).
