pTerm 1.1.0은 macOS 터미널의 기록·자동화·연결 도구를 확장합니다.

- 자동 파일 로그·용량별 회전, 텍스트/RTF/JSON 내보내기
- 기본값→그룹→호스트 설정 상속, SSH 연결 후 명령, 출력 감지 명령 트리거
- 다중 세션 전송, 정규식 검색, 입력 기록·키 매핑·닫기 보호
- SSH 로컬/원격 포워딩·SOCKS5, 시리얼 연결
- 저장 연결·공유 인증 프로필, Python/Node 세션 자동화
- OpenSSH 고급 인증, SCP·FTP/FTPS·FreeRDP 등 외부 엔진 연동
- 로그 쓰기 지연·오류 후 정리와 재시작 처리 보완

## 다운로드

**pTerm-1.1.0-macos-arm64.zip**을 받아 압축을 풀어 pTerm.app을 실행하세요. Apple Silicon Mac용입니다. Source code는 실행 앱이 아닙니다. SHA256SUMS.txt로 파일 무결성을 확인할 수 있습니다.

앱은 ad-hoc 서명이며 Apple Developer ID 서명·공증은 포함하지 않습니다. [첫 실행 안내](https://github.com/Polar-Little-Lab/pTerm/blob/v1.1.0/docs/macos-first-launch.md)를 참고하세요. 기존 저장소·Keychain 식별자를 유지합니다.

## 지원 범위

고급 SSH·SCP·FTP는 시스템 OpenSSH/scp/curl을 사용하고 RDP는 별도 설치된 FreeRDP 창으로 실행됩니다. Python/Node 등의 실행 엔진은 별도 필요합니다. Xshell 전체 기능이나 기존 스크립트의 무수정 호환을 뜻하지 않습니다.

macOS 자동 테스트·앱 빌드·서명 무결성·ZIP 체크섬을 검증합니다. 실제 GUI 수동 테스트, 시리얼 장치·인증 토큰·운영 서버와의 연동 검증은 별도입니다.

[터미널 도구](https://github.com/Polar-Little-Lab/pTerm/blob/v1.1.0/docs/terminal-tools.md) · [연결·자동화](https://github.com/Polar-Little-Lab/pTerm/blob/v1.1.0/docs/native-connections.md) · [미구현 범위](https://github.com/Polar-Little-Lab/pTerm/blob/v1.1.0/docs/xshell-parity.md)
