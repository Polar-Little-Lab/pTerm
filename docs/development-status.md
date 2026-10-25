# Harbor SSH 개발 현황

**최신: 0.2 Polar Night** — [현재 기능·검증·제한](https://github.com/Polar-Little-Lab/polarsh/blob/main/docs/release-0.2.md), [디자인 시스템](design-system.md). 아래 내용은 초기 0.1 구현 기록이며, Vault/Keychain·SFTP·그룹·태그·즐겨찾기·저장 명령은 0.2에서 추가했다.

2026-10-24. 사용자의 후속 앱 개발 요청으로 초기 분석·설계 범위를 확장했다. 이 문서는 기존 계획 문서의 현재 구현 여부보다 우선한다.

## 실제 구현

Tauri 2.12.5 / Rust 1.99.1 / russh 0.64.1 / React 19 / TypeScript 5.9 / xterm.js 6. Cargo.lock과 package-lock.json을 보존한다. Rust는 rustup minimal로 설치하고 rustfmt/clippy를 추가했다. 기존 시스템 Node와 셸 시작 파일은 변경하지 않았다.

- `app/src-tauri/src/ssh.rs`: 비밀번호·암호화 개인 키 인증, 인증 전 SHA-256 host-key pinning, PTY/shell, 연결·인증 시간 제한. 최초 키는 확인을 요구하고 변경된 키는 차단한다.
- `app/src-tauri/src/main.rs`: 최대 16세션, 세션별 bounded command queue, 연결 중 취소, 종료, resize. 출력 ACK 크레딧 8개, SSH packet 32 KiB/window 256 KiB.
- `app/src/main.tsx`: 한국어 연결 폼, 신뢰 확인, xterm 다중 탭, 호스트 저장·삭제·검색. 입력은 16 KiB 이하 청크로 순서 보장하고 대기 입력은 1 MiB로 제한한다.
- 호스트와 서버 지문은 WebView localStorage 평문이다. 비밀번호/키 암호는 저장하지 않는다. 개인 키 인증 시 지정한 파일을 Rust에서 읽으며 실제 사용자 키로 자동 테스트하지 않았다.
- 독립 디자인과 공개 프로토콜/라이브러리를 사용했다. Termius 독점 코드·리소스·계정·자격증명을 가져오지 않았다.

## 검증 결과

| 검증 | 결과 / 증거 |
|---|---|
| Rust 실제 SSH 통합 테스트 | 7 passed, 0 failed — 로그 (`../logs/app-rust-tests.log` · 이전 개발 환경의 로컬 기록, 저장소 미포함) |
| Clippy 전체 target | 경고를 오류로 처리해 통과 — 로그 (`../logs/app-clippy.log` · 이전 개발 환경의 로컬 기록, 저장소 미포함) |
| TypeScript/Vite | 빌드 통과 — 로그 (`../logs/app-frontend-build.log` · 이전 개발 환경의 로컬 기록, 저장소 미포함) |
| macOS arm64 앱 | debug bundle 생성, 41.84 MiB — 로그 (`../logs/app-desktop-build-final.log` · 이전 개발 환경의 로컬 기록, 저장소 미포함) |
| 화면 | 브라우저 렌더링·개인 키 폼·데스크톱 전용 연결 안내 확인, native 앱 실행·렌더링 확인 |
| native UI 전체 SSH 연결 | 미완료. 사용자 앱 조작이 감지되어 자동 조작을 중단하고 열린 세션을 보존 |

통합 테스트는 loopback의 synthetic russh SSH 서버와 임시 생성 키를 사용한다. 잘못된 입력, 미등록/변경 서버 키의 인증 전 거부, 잘못된 비밀번호, 정상 PTY/한국어·emoji echo/resize, 암호화 개인 키 성공, 잘못된 키 암호 거부를 검증했다. 실제 OpenSSH 서버와 native UI 전체 흐름의 검증을 대체하지 않는다.

## 남은 범위

SQLite/Vault/Keychain, Groups/Tags/즐겨찾기, SSH agent/MFA/jump/forwarding, split/자동 재연결, SFTP, 로그/snippets/workspace, sync/AI/협업은 미구현이다. 현재는 안전한 로컬 MVP 완성 전의 개발 미리보기다.

다음 단계는 OpenSSH 상호운용 및 WKWebView 입력·한글 IME·부하/취소 시험, Vault/Keychain 저장소 구현, 이후 SFTP다. 키 파일의 blocking 읽기/복호화 작업은 timeout 후에도 즉시 종료되지 않을 수 있어 별도 검증이 필요하다. debug 빌드 성능이나 번들 크기로 Termius 대비 속도·RAM 우위를 주장하지 않는다. 배포 서명·공증과 장시간 안정성 시험도 남아 있다.

## REA 후속 검증

Codex의 `exec --approve-for-me` 자동 승인 검토 경로에서 실제 MCP 호출이 성공했다. 전역 승인 정책·macOS 보안 설정은 변경하지 않았다. 초기 never 정책 실패는 과거 로그로 보존한다.

- open_binary/inspect_artifact 실제 호출 (`../logs/codex-rea-reviewed.jsonl` · 이전 개발 환경의 로컬 기록, 저장소 미포함): open_binary 성공, inspect_artifact는 기본 정책의 integrity mismatch를 실제 반환.
- 선택 JS 분석 실제 호출 (`../logs/codex-rea-analysis.jsonl` · 이전 개발 환경의 로컬 기록, 저장소 미포함): parsed 2, skipped 0, parse_failures 0, AST nodes 7,808, findings 92. 17개 무결성 모순은 observed-untrusted로 유지.
- Evidence: `ev_85858f1516d17a5f38fb65fbb4789d3722ad66361963707e34ffaa0d83696c18`.
- preload 단독 4 GiB heap 재분석은 여전히 heap 소진, parsed 0/skipped 1. 전체 의미 분석 완료로 보고하지 않는다.

REA 설치·등록·연결·실제 Codex 도구 호출 기준을 모두 충족했다. 앱 개발은 REA 실행에 의존하지 않는다.
