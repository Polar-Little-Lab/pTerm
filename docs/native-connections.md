# macOS 연결·실행과 세션 스크립트

연결 엔진은 v1.1.0에 포함되어 있다. 아래 호스트 중심 화면 개선은 후속 PR의 변경 사항이다.

## 진입과 저장

호스트 카드나 이름을 누르면 **기본 연결** 화면이 열린다. 카드의 **연결** 버튼은 바로 접속하며, 이미 연결된 경우 기존 세션으로 이동한다. 같은 모달의 **고급 연결·전송**에서는 호스트 주소·포트·사용자·키 경로를 가져온다. 기본 SSH의 비밀번호나 Bastion 경로를 외부 엔진으로 자동 전달하지 않으며 경유 설정은 별도로 확인한다.

고급 인증 및 **연결 저장·인증 프로필 관리**는 필요할 때 펼친다. 제목과 실행 버튼은 고정하고 긴 설정 영역만 스크롤한다.

호스트와 무관한 작업은 상단 **기타 연결**, 또는 **⌘ K**에서 RDP·시리얼·고급 SSH·스크립트·SCP/FTP를 검색한다. 방식 선택 → 설정 입력 → **설정 확인**에서 실행 파일과 인자를 검토 → **연결·실행** 순서로 실행한다. 실행 엔진이 없으면 경로와 오류를 표시하며 연결을 성공으로 표시하지 않는다. 실행 중인 작업은 생성된 탭을 닫아 종료한다.

**연결 이름**은 접속 설정, **인증 프로필 이름**은 여러 고급 SSH/SCP 연결에서 공유할 인증 설정이다. 저장에는 Vault 잠금 해제가 필요하다. 프로필을 선택하면 인증 필드는 읽기 전용이 되고 **프로필 설정 수정 → 인증 프로필 저장**으로 수정한다. 변경은 다음 연결부터 적용된다. 사용 중인 프로필은 연결을 직접 설정으로 바꾼 후 삭제한다.

프로필에는 사용자 이름, 키·인증서·PKCS#11 라이브러리의 경로, GSSAPI 설정을 저장한다. 비밀번호와 PIN은 실행 엔진의 프롬프트에서 입력하며 프로필에는 저장하지 않는다. 연결·프로필은 pTerm JSON 이전에 포함되고, 가져올 때 ID와 프로필 참조를 재배정한다. 실행 파일·키 경로는 새 Mac에 맞춰 확인해야 한다. 스크립트 인자에 직접 넣은 비밀 값은 자동 제거되지 않는다.

## 연결 방식

| 방식 | 구현과 필요한 환경 | 주요 설정 |
|---|---|---|
| 기본 SSH | 앱 내부 russh. 기존 호스트 화면에서 연결 | 비밀번호·키·Agent·Bastion·SFTP·내부 터널 |
| 고급 SSH | macOS OpenSSH를 pTerm PTY에서 실행 | 인증서, PKCS#11, GSSAPI, Agent/X11 forwarding, 점프 호스트, config 파일 |
| 시리얼 | 앱 내부 termios 입출력 | `/dev/cu.*`, 1200–230400 baud, 7/8 data bits, 1/2 stop bits, parity, XON/XOFF 또는 RTS/CTS |
| RDP | 설치된 SDL FreeRDP 또는 MacFreeRDP를 실행. 데스크톱은 별도 창 | 호스트·포트·사용자 이름. 엔진 경로 수동 지정 가능 |
| SCP | macOS `scp -O`의 SCP 프로토콜 | 업/다운로드, 절대 파일 경로, 키·인증 프로필·점프 호스트 |
| FTP/FTPS | macOS curl의 passive FTP. 기본 TLS 필수 | 업/다운로드, 사용자 이름, 절대 원격 경로, TLS 설정 |
| Telnet/Rlogin | 설치된 클라이언트를 pTerm PTY에서 실행 | 호스트, Telnet 포트, Rlogin 사용자 이름 |
| 로컬 스크립트 | Python 3, Node.js, macOS JXA | 파일·JSON 인자·작업 폴더·실행 엔진 |

고급 SSH는 OpenSSH의 known_hosts와 config를 사용한다. 기본 SSH의 지문 저장소와 별개다. 기본 SSH의 SFTP·터널 패널은 외부 SSH 프로세스에 붙지 않는다. OpenSSH config와 클라이언트 자체 설정으로 해당 기능을 설정할 수 있다. PKCS#11 공급자와 토큰, Kerberos 티켓과 서버 설정, X11의 XQuartz는 별도 환경이 필요하다.

RDP는 pTerm 내부 화면 렌더러를 구현한 것이 아니다. 설치된 FreeRDP의 인증·인증서 대화상자와 렌더링을 사용한다. `cert:ignore`나 비밀번호 명령줄 인자는 자동으로 추가하지 않는다. 실제 RDP 서버와 GUI 검증은 별도다.

SCP/FTP는 터미널에서 인증과 진행 상황을 표시한다. SFTP 탐색기의 전송 큐와는 별개이며 대상 파일을 덮어쓸 수 있다. 다운로드 경로 선택은 시스템 저장 대화상자를 사용한다. 업로드는 존재하는 파일을 선택한다.

## Python / JavaScript 세션 자동화

**터미널 도구 → 자동화 → Python / JavaScript로 현재 세션 자동화**에서 파일을 선택한다. 대상 세션과 파일을 확인한 뒤 실행한다. 일반 **연결·실행**의 로컬 스크립트 모드와 달리 현재 세션 API를 제공한다.

Python:

```python
import pterm
pterm.send("printf 'READY\\n'\n")
print(pterm.expect("READY", timeout=10000))
pterm.sleep(250)
```

JavaScript `.mjs`:

```javascript
export default async (pterm) => {
  await pterm.send("printf 'READY\\n'\n");
  console.log(await pterm.expect("READY", 10000));
  await pterm.sleep(250);
};
```

Node에서는 top-level await 또는 내보낸 async 함수를 사용하고 모든 API 호출을 await한다. 동시 API 호출은 허용하지 않는다. Python 인자는 `sys.argv[1:]`, Node 인자는 `process.argv.slice(2)`로 읽는다. 작업 폴더는 스크립트 파일의 폴더다. Python은 같은 폴더의 모듈을 import할 수 있다.

- `send(text)`: 최대 16 KiB의 실제 터미널 입력. 줄바꿈은 명령을 실행할 수 있다.
- `expect(text, timeout)`: 이전 send 이후 또는 직전 expect가 소비한 위치 이후의 출력을 기다린다. 문자열은 최대 256자, 기본 10초·최대 60초다. 최근 8,192자 버퍼에서 찾는다. 반환값은 일치한 문자열까지의 출력이다. 명령의 성공 여부를 판정하지는 않는다.
- `sleep(milliseconds)`: 0–30,000ms 대기.

화면을 닫거나 세션이 종료되면 실행 프로세스를 중지한다. 이미 전달된 명령은 되돌리지 않는다. 로컬 스크립트는 사용자 권한으로 실행하므로 신뢰하는 파일만 사용한다. stdout은 pTerm RPC 통신에도 쓰이므로 예약 접두사 `\x1ePTERM `를 직접 출력하지 않는다. stderr와 일반 stdout은 도구 화면에서 확인하며 마지막 64 KiB만 표시한다.

최대 4개 실행 프로세스, 전체 출력 4 MiB, 출력 한 줄 64 KiB, API 요청 10,000회 제한이 있다. API 오류는 Python 예외/JavaScript Promise 거절로 전달한다. Xshell의 `xsh` API와 Windows VBScript/WSH는 호환되지 않으며 pterm API로 변환해야 한다. JXA는 로컬 실행 모드만 제공한다.

## 검증 범위

macOS CI에서 네이티브 컴파일, SSH 원격 포워딩의 양방향 전송·취소·미등록 경로 거부, OpenSSH의 오프라인 `-G` 설정 해석, SCP/FTP/RDP 인자 생성, Python/Node 프로세스 RPC를 검증한다. 실제 시리얼 하드웨어, PKCS#11 토큰, Kerberos 서버, RDP GUI, 운영 서버 간 파일 전송을 이 CI 결과로 검증했다고 보지 않는다.
