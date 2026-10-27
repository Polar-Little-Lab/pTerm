# 변경 이력

## 1.1.0 · 2026-10-27

- 다중 세션 전송, 정규식 검색, 입력 기록·키 매핑·닫기 보호
- 자동 파일 로그·회전·RTF 내보내기, 오류 후 파일 정리와 재시작 보호
- 기본값→그룹→호스트 설정 상속, SSH 연결 후 명령과 출력 감지 트리거
- SSH 포트 포워딩·SOCKS5, 시리얼 연결
- 저장 연결·공유 인증 프로필과 설정 가져오기/내보내기
- OpenSSH 고급 인증, SCP·FTP/FTPS·FreeRDP 등 외부 엔진 연동
- Python/Node의 세션 send/expect/sleep 자동화

Apple Silicon용 macOS 앱 ZIP과 SHA-256 체크섬을 GitHub 릴리스에서 제공합니다.
외부 엔진 필요 사항과 미구현 범위는 [기능 대응 상태](docs/xshell-parity.md), 출시 절차는 [1.1.0 준비](docs/release-1.1.0.md)를 확인하세요.

## 1.0.0 · 2026-10-25

pTerm의 첫 정식 릴리스입니다.

- 로컬 셸과 SSH 터미널, 다중 탭, 드래그 분할과 크기 조절
- 비밀번호·개인 키·SSH Agent 인증, 서버 지문 확인, Bastion 경유 연결
- 호스트·그룹·태그·즐겨찾기와 선택 관리
- 암호화된 로컬 저장소와 macOS Keychain, 선택적 접속 자격증명 저장
- SFTP 탐색·업로드·다운로드와 전송 취소
- 저장 명령 검색과 입력 중 자동 제안
- Frost 등 9개 테마와 테마에 맞춘 제목 표시줄

Apple Silicon용 macOS 앱을 제공합니다. Developer ID 서명과 공증은 포함하지 않습니다.
기존 Polarsh 저장소와 릴리스는 이전 제품의 이력으로 보존하며 pTerm의 버전 번호와 분리합니다.
