# 기능 매트릭스와 독립 구현 계획

**0.2 업데이트:** Vault/Keychain, 즐겨찾기·그룹·태그, SFTP 탐색·폴더 생성·파일 전송·진행률·취소, 저장 명령을 추가했다. [구체적인 지원 범위와 제한](https://github.com/Polar-Little-Lab/polarsh/blob/main/docs/release-0.2.md). 아래 Termius 조사와 초기 계획은 이 구현 상태와 구분한다.

현재 Harbor SSH 개발 미리보기에는 비밀번호·개인 키 인증, 서버 지문 검증, 다중 탭, PTY resize, 연결 취소, 호스트 저장·삭제·검색을 구현했다. 나머지는 아래 계획이며 모든 P0가 완료된 것은 아니다. [구현과 검증 범위](development-status.md).

기준일 2026-10-24. 공개 문서 기준의 제공 여부와 설치본 실행 검증은 구분한다. 기존 계정의 요금제나 실제 동작은 확인하지 않았다. 아래 `확인`은 공식 문서 또는 명시한 정적 증거를 뜻한다. 요금제 표의 체크 아이콘이 텍스트 추출에서 소실된 세부 항목은 Starter/Pro를 추측하지 않고 `요금제 미확정`으로 남긴다.

[공식 가격표](https://termius.com/pricing)의 명시적 분류: Starter에는 로컬 vault, SSH/SFTP, AI 자동완성, port forwarding이 있다. Pro에는 개인 cloud vault, 기기 동기화, 세션 로그, snippets automation이 추가된다. Team은 team vault·실시간 협업·공유 로그, Business는 복수 team vault·세분화된 접근제어를 추가한다. 따라서 아래 고급 기능 전부를 “Pro 전용”이라고 부르지 않는다.

우선순위: P0=안전한 첫 SSH MVP, P1=일상 사용, P2=생산성, P3=서비스/협업 확장. 난이도는 1인 개발의 상대 추정이며 기간 약속이 아니다.

| 기능 | 현재 제공 여부 / 요금제 근거 | 난이도 / 우선순위 | 독립 구현과 완료 조건 |
|---|---|---|---|
| SSH 접속·인증 | 확인, Starter [A] | 높음 / P0 | password, encrypted key, keyboard-interactive; 실패/취소/host-key 변경 테스트 |
| 다중 세션·탭 | 확인, Workspace 문서 [B]; 세부 요금제 미확정 | 중간 / P0 | 세션별 actor, 독립 버퍼; 한 연결 오류가 다른 탭에 전파되지 않음 |
| 화면 분할 | 확인, Split view 최대 16 [B]; 요금제 미확정 | 중간 / P1 | 분할 트리, resize debounce, focus/IME 처리 |
| SSH key 인증 | 확인 [C]; 키 유형별 요금제 미확정 | 높음 / P0 | Ed25519/RSA-SHA2 우선, passphrase Rust에서 처리 |
| SSH Agent / agent forwarding | 가격표에 agent forwarding 명시 [A]; 요금제 미확정 | 높음 / P1 | 로컬 agent 서명과 원격 forwarding 구분; forwarding 기본 off |
| Jump Host / Host chain | 확인 [A,D]; 요금제 미확정 | 높음 / P1 | direct-tcpip 중첩, 각 hop host-key 검증, 순환 제한 |
| Port Forwarding | 확인, Starter [A] | 높음 / P1 | local/remote/dynamic, 기본 loopback bind, 충돌·해제 테스트 |
| 재연결 | `reconnectSaga` 파일 존재; 현재 동작·정책은 미확인 | 높음 / P1 | backoff+jitter, sleep/wake, auth 실패 무한 재시도 방지; 기존 shell 보존과 구별 |
| 테마 / 단축키 | 단축키는 공식 [B]; 테마의 최신 범위 미확인 | 낮음~중간 / P1 | 자체 디자인 토큰/키맵, 접근성·한글 IME 확인 |
| Hosts / Groups / Tags | 확인 [D,E,F] | 중간 / P0 | 계층 group, tags, 상속 우선순위와 순환 방지 |
| 검색 / 즐겨찾기 | 검색 UI 파일 단서; 즐겨찾기 제공 여부 미확인 | 낮음 / P0 | 로컬 검색·pin을 자체 요구사항으로 구현 |
| 로컬 암호화 Vault | 로컬 vault Starter [A]; 로컬 at-rest 세부 설계 미확인 | 높음 / P0 | AEAD 레코드 암호화, 잠금/복구/키 회전 테스트 |
| macOS Keychain | keytar native 모듈 존재; 실제 저장 정책 미확인 | 높음 / P0 | 별도 service/account namespace에 vault key; Termius 항목 접근 금지 |
| SSH 키 생성·관리 | 확인 [C] | 높음 / P1 | 검증된 crypto crate 또는 ssh-keygen, 암호화 내보내기 |
| 호스트 가져오기 | SSH config·CSV·PuTTY 등 확인 [F] | 중간 / P1 | 사용자 선택 파일만 import, dry-run/중복 처리, ProxyCommand 실행 금지 |
| 호스트 내보내기 | 현행 공식 근거로 미확인 | 중간 / P1 | 자체 JSON/CSV, 기본 비밀 제외, 암호화 백업 별도 |
| SFTP 원격 탐색 | 확인, Starter [A,G] | 중간 / P1 | stat/list/lstat, 페이지/취소, symlink 별도 표시 |
| 업로드 / 다운로드 | 확인 [G] | 높음 / P1 | 임시 파일 후 rename, overwrite 확인, checksum 비교 |
| 폴더 관리 | 문서에서 file management 확인 [G]; 세부 조작 별 검증 필요 | 중간 / P1 | mkdir/rename/delete, symlink 및 재귀 삭제 경계 |
| 전송 진행률 / 취소 | 최신 페이지의 개별 UI 동작 미확인 | 높음 / P1 | byte progress, cancel token, 잔여 temp 정책 |
| 다중 파일 전송 | 전송 기능 확인 [G]; 동시 처리 정책 미확인 | 높음 / P1 | bounded queue, 초기 concurrency 2~4, 서버별 조정 |
| Snippets | 확인, 자동화 Pro [A,H] | 중간 / P2 | 로컬 저장, paste/run 구분, 변수 escaping |
| 명령 자동화 | multi-host/startup snippets 확인 [H] | 높음 / P2 | 실행 계획/대상 표시, 동시성 제한, 재연결 때 자동 재실행 금지 |
| 세션 로그 | 확인, Pro [A,I] | 높음 / P2 | opt-in 암호화 출력 로그, retention/delete/export |
| 로그 검색 | 로그 열람·정렬/필터 확인 [I]; 전역 전문 검색 미확인 | 높음 / P2 | unlock 중 메모리 검색, 평문 FTS 디스크 유출 방지 |
| E2EE 기기 동기화 | 확인, Pro [A,J] | 매우 높음 / P3 | 암호문 sync, device enrollment/revocation, 충돌·복구 설계 |
| Workspace 관리 | desktop 확인 [B]; 세부 요금제 미확정 | 중간 / P2 | 탭/분할/host 참조 저장, 명령 자동 재실행은 명시적 선택 |
| Broadcast Input | Workspace Focus/Split에서 확인 [B]; 요금제 미확정 | 높음 / P2 | 대상 고정/강조, 인증 중 차단, 순서·backpressure 유지 |
| AI 명령어 추천 | Starter AI autocomplete [A,K], AI snippet 생성 [H] | 높음 / P3 | 먼저 로컬 history/snippet 추천; opt-in AI는 미리보기 후 명시적 실행 |
| 협업·공유 | Team 이상 [A]; Pro 개인 sync와 다름 | 매우 높음 / P3 | read-only 초대부터, E2EE key distribution, 역할·취소·감사 |

## 제품 범위 결정

첫 릴리스는 macOS 단일 사용자 로컬 앱으로 제한한다. P0/P1은 계정·서버 없이 동작하도록 설계한다. AI/동기화/협업은 별도 선택 모듈로 분리한다. Termius의 Mosh, Telnet, Serial, FIDO2/생체 인증, SSH certificates, SSH ID, PQC는 이번 목록의 필수 MVP는 아니지만 호환성 격차로 추적한다. 키·알고리즘 지원은 library 버전과 실서버 조합으로 검증해야 한다.

현재 가격표와 일부 개념 문서의 “모든 계정 personal vault” 설명에는 표현 차이가 있다. 요금제 판정은 가격표의 명시적 Starter/Pro 설명을 우선하고, 세부 체크가 확인되지 않은 항목을 단정하지 않았다.

## 출처

- [A — Pricing](https://termius.com/pricing)
- [B — Workspaces](https://docs.termius.com/terminal/workspaces.md)
- [C — SSH keys and certificates](https://docs.termius.com/keychain/ssh-keys-and-certificates.md)
- [D — What is Termius](https://docs.termius.com/getting-started/what-is-termius.md)
- [E — 공식 문서 인덱스](https://docs.termius.com/llms.txt): Groups and tags의 존재 확인; 본문 요청은 403이었다.
- [F — Import existing hosts](https://docs.termius.com/getting-started/import-existing-hosts.md)
- [G — Managing files with SFTP](https://docs.termius.com/organize-and-connect-to-hosts/managing-files-with-sftp.md)
- [H — Snippets](https://docs.termius.com/terminal/snippets.md)
- [I — Session logs](https://docs.termius.com/organize-and-connect-to-hosts/session-logs.md)
- [J — Security](https://termius.com/security)
- [K — Autocomplete & Shell integration](https://docs.termius.com/terminal/autocomplete-and-shell-integration.md)

일부 문서 요청(변경 이력, 구독 만료 FAQ, Groups and tags, encryption overview)이 403/접근 오류로 실패했다. 미확인은 기능 부재를 의미하지 않는다. 설치본의 Pro 기능을 활성화하거나 라이선스 체크 코드를 조사해 빈칸을 채우지 않았다.
