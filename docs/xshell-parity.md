# Xshell 기능 대응 상태 — macOS 우선

목표는 Xshell 상용판의 공개 기능을 macOS에서 직관적으로 제공하는 것이다. **현재 브랜치는 전체 기능 동등성을 달성하지 않았다.** 구현, 외부 엔진 연동, 미구현, 실환경 검증 대기를 구분한다. 목록에 있거나 UI에 선택지가 있다는 이유만으로 자체 구현 완료라고 표시하지 않는다.

공개 기능 기준: https://www.netsarang.com/en/xshell-all-features/ 및 https://www.netsarang.com/en/xshell-update-history/ (2026-10-26 조사). Xftp/Xmanager/Xlpd는 별도 제품이며 Xshell 자체 기능과 구분한다.

## 구현 현황

| 영역 | 현재 제공 | 제한 또는 남은 작업 |
|---|---|---|
| 기본 터미널 | macOS PTY, SSH, 탭, 드래그 분할·이동·크기 조절 | 앱 재시작 시 탭·출력 복원 없음 |
| 입력 | 여러 줄 붙여넣기 확인·편집, 작성 창, 대상 선택 다중 전송, 저장 명령, 세션 키 매핑 | 별칭·빠른 명령 트리·고급 마우스 옵션 미구현 |
| 검색·화면 | 문자열/정규식 검색, 대소문자, 이전/다음, 글꼴 크기·커서·닫기 보호, 테마 | 영구 정규식 강조 규칙, 인코딩 변환, 고정 크기·가로 스크롤·캡처 인쇄 미구현 |
| 기록 | 수동 기록, 수신 시각, Hex, 텍스트/RTF/JSON 내보내기, JSON 순서 재생, 자동 파일 기록·회전·기록 상태 표시 | 메모리 1 MiB/4096청크. 파일 보존은 기록 실행별. 원본 시간 간격 재생·지난 연결 로그의 기간별 정리 미구현 |
| 세션 관리 | 호스트 그룹·태그·즐겨찾기·검색·일괄 이동, Bastion, JSON 이전, 저장 연결, 공유 인증 프로필, 기본값→그룹→호스트 속성 상속 | 세션 그룹 일괄 실행, 시작 세션 설정 미구현 |
| 인증 | 내부 SSH의 비밀번호·개인 키·Agent·지문 검증, Keychain 암호화 저장 | 고급 인증은 아래 OpenSSH 연동 사용. 키 생성 GUI 미구현 |
| 고급 SSH | OpenSSH CA 인증서·PKCS#11·GSSAPI·Agent forwarding·X11·config·점프 호스트 UI | 시스템 OpenSSH 엔진. 내부 russh/SFTP 연결과 별개. 토큰·티켓·XQuartz 필요 |
| 터널 | 내부 SSH의 로컬·원격 포트 포워딩, SOCKS5 CONNECT, 중지·부모 종료 정리 | 최대 32터널, 터널당 64스트림. SOCKS4·UDP·HTTP 프록시 미구현 |
| 자동화 | JSON send/wait/expect, 취소·시간 제한·입력 기록, 문자열 알림/자동 명령 트리거, SSH 연결 후 명령 | 트리거는 세션 메모리. 연결 후 명령은 문자열 전송이며 외부 스크립트 파일 자동 실행 아님 |
| Python/JavaScript | 실제 Python/Node 실행 엔진 + 현재 세션 pterm.send/expect/sleep API, 인자, 출력, 취소 | Xshell xsh API와 호환되지 않음. 변환 필요. JXA는 로컬 실행만 지원 |
| SFTP | 양방향 탐색·업로드·다운로드·취소·파일 이름 필터 | 외부 편집기 및 X/Y/ZMODEM·ASCII 전송 미구현 |
| SCP/FTP | SCP 및 FTP/FTPS 업/다운로드 폼, 인증 프로필, 진행 터미널, 취소 | macOS scp/curl 실행. SFTP 탐색기와 통합된 큐는 아님 |
| SERIAL | /dev/cu.* 검색, 속도·data/stop bits·parity·흐름 제어, 비동기 입출력, 종료 시 설정 복원 | 실제 USB/시리얼 장치 검증 대기 |
| TELNET/RLOGIN | 설치된 클라이언트 실행·PTY 입출력 | 외부 클라이언트 필요. 내장 프로토콜 엔진 아님 |
| RDP | SDL FreeRDP/MacFreeRDP 실행 연동, 접속 설정·엔진 선택·오류 표시 | 외부 데스크톱 창. 내부 RDP 렌더러 미구현. 실제 GUI/서버 검증 대기 |

## 플랫폼 차이

Windows CMD/WSL/ConPTY/SSPI/CAPI/Pageant/VBScript/WSH는 macOS 기능으로 표시하지 않는다. macOS는 PTY·사용자 셸·Keychain·ssh-agent·OpenSSH·Python/Node/JXA로 각 목적에 대응한다. Windows API나 기존 Xshell 스크립트의 무수정 호환을 뜻하지 않는다. SSH1 등 레거시 프로토콜은 구현하지 않았다.

## 검증

- 프런트엔드: 71개 스크립트 테스트 + 46개 앱 테스트. 연결 화면의 검토 후 실행, 실패 시 유지, 최신 프로필 적용, 데이터 이전, 스크립트 취소/시간 초과 등을 포함한다.
- 실제 Python/Node 프로세스로 인자·send/expect 요청·응답·정상 종료를 검증한다.
- macOS CI에서 Rust 컴파일/테스트를 실행한다. SSH 테스트 서버에서 원격 포워딩의 양방향 데이터, 미등록 경로 거부, 중지 후 EOF 및 리스너 종료를 검증한다.
- OpenSSH `-G` 오프라인 검사로 인증서 경로의 공백, 점프 호스트, X11/Agent 옵션 전달을 검증한다. SCP/FTP/RDP는 인자와 경로 처리 테스트를 포함한다.
- Keychain 통합 2개, 2분 PTY soak, 실제 keepalive timeout fault injection은 기본 CI에서 제외된 기존 명시적 테스트다.
- 자동 로그의 바이트 보존·회전·동일 이름 파일 보호, 상속 해제·가져오기, 자동 명령의 재진입·횟수·중지·실패, SSH 시작 명령의 순서·중복 방지를 검증한다.
- 실제 GUI·시리얼 장치·PKCS#11 토큰·Kerberos 서버·RDP 화면·운영 서버 파일 전송은 이 CI로 검증하지 않는다. ARM64/Intel 각각의 실제 앱 실행 검증도 별도다.

## 완료 기준

미구현 항목의 실제 동작과 오류·취소·저장 흐름을 완성하고, 지원하는 Mac 아키텍처에서 빌드·실행을 검증해야 전체 대응 완료로 표시할 수 있다. 단순 외부 프로그램 실행을 내장 기능 동등성으로 계산하지 않는다. 사용 안내는 [터미널 도구](terminal-tools.md), [네이티브 연결·실행과 스크립트](native-connections.md)를 참조한다.
