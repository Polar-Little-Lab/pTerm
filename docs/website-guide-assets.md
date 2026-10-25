# 사용 가이드 웹 게시 안내

Polarsh 1.0.0 · Frost · 2026-10-25

## 가져갈 파일

- 본문: [user-guide.md](user-guide.md)
- 설치 도움말: [macos-first-launch.md](macos-first-launch.md)
- 이미지: [assets/guide](assets/guide/)의 PNG 11장
- 촬영 근거: [guide-capture-verification.md](guide-capture-verification.md)
- 변경 이력: [CHANGELOG.md](../CHANGELOG.md)

릴리스의 `Polarsh-1.0.0-guide-frost.zip`에는 본문과 이미지가 상대 경로를 유지한 상태로 들어 있습니다. 웹사이트 파일로 옮길 때 폴더 구조를 유지하세요. 실제 웹사이트의 게시 파일은 이번 작업에서 변경하지 않았습니다.

## 권장 페이지 구성

- 제목: **Polarsh 시작하기 · Frost**
- 소개: **로컬 개발부터 SSH 서버 관리까지, 하나의 터미널에서 작업하세요.**
- 대표 이미지: `04-split.png`
- 버튼: **macOS용 다운로드**, **사용 가이드**, **변경 이력**
- 순서: 설치 → 로컬 작업 → 호스트·인증 정보 저장 → SSH·Bastion → 분할 → 빠른 전환 → SFTP → 저장 명령 → 테마

11장 모두 실제 macOS 앱 창을 촬영한 989×768px PNG입니다. 비율을 유지하고 클릭 시 원본을 볼 수 있게 하세요. 긴 폼은 앱 내부에서 스크롤한 상태이며 합성하거나 폼 전체를 이어 붙이지 않았습니다.

| 파일 | 캡션 |
| --- | --- |
| `00-local.png` | 시작 폴더와 기본 로그인 셸을 선택합니다. |
| `01-hosts.png` | 실습 그룹의 연결된 SSH 호스트를 관리합니다. |
| `02-new-host.png` | 저장된 호스트의 접속 설정과 인증 상태를 편집합니다. |
| `03-bastion.png` | 이 Mac → Bastion → 내부 서버의 경로를 확인합니다. |
| `04-split.png` | 실제 로컬 셸 세 개를 왼쪽 크게 · 3분할로 배치합니다. |
| `06-snippet.png` | 디스크 사용량 명령을 저장합니다. |
| `07-themes.png` | Frost 테마를 선택합니다. 제목 표시줄도 같은 색으로 이어집니다. |
| `08-quick-switch.png` | 열린 세션과 저장된 호스트를 검색합니다. |
| `10-fingerprint.png` | 서버 지문을 대조한 후 첫 연결을 승인합니다. |
| `11-snippet-picker.png` | 터미널에서 저장 명령을 찾아 삽입합니다. |
| `12-saved-credentials.png` | 저장된 비밀번호 상태와 삭제 버튼을 확인합니다. 저장 옵션과 태그 사이에 여백을 두었습니다. |

## 촬영·게시 범위

촬영용 앱의 번들 식별자만 분리해 사용자 저장소를 보호했습니다. 실제 SSH 비밀번호 인증과 Bastion 연결은 이 Mac의 loopback 실습 서버로 수행했습니다. 가짜 인증 정보만 사용했고, 로컬 셸의 사용자·기기 이름 대신 촬영용 프롬프트를 설정했습니다. 터미널 출력과 연결 상태를 이미지로 합성하지 않았습니다.

이전 SFTP·배치 메뉴 이미지는 `assets/guide-archive/20261024/`로 분리했습니다. 마우스 조작 도구 오류로 다시 촬영하지 못해 최신 게시용 묶음에서는 제외했습니다. 사용법은 본문에 유지했습니다.

다운로드 버튼 옆에는 [macOS 첫 실행 도움말](macos-first-launch.md)을 연결하세요. Apple Developer ID 서명·공증은 없고 Apple Silicon용 앱만 제공합니다. Intel·Windows·Linux 지원이나 동기화·협업 기능을 지원한다고 안내하지 마세요. 저장소 공개 여부는 이번 작업에서 변경하지 않았습니다.
