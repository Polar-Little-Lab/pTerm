# pTerm 1.1.4

## 변경 사항

- GitHub Actions에서 Developer ID Application 서명과 Apple 공증을 적용합니다.
- Hardened Runtime, 보안 타임스탬프, 공증 티켓 및 Gatekeeper 검증을 통과한 앱만 배포합니다.

## 호환성 및 데이터

- Bundle ID `dev.harbor.ssh`와 기존 호스트·저장 명령 데이터를 유지합니다.
- 기존 ad-hoc 앱에서 처음 전환할 때 Keychain 접근 재승인이 필요할 수 있습니다. 이후 일관된 개발자 서명으로 앱 신원을 유지합니다.
- 별도 Touch ID 인증이나 Vault 보안 정책 변경은 포함하지 않습니다.

## 다운로드

Apple Silicon Mac용 ZIP입니다. 기존 앱을 종료한 뒤 Applications의 앱을 교체하세요. ZIP과 SHA256SUMS.txt를 함께 제공합니다. 실제 사용자 Mac에서의 최초 Keychain 승인 및 업데이트 간 재승인 UX는 별도 확인이 필요합니다.


다운로드한 ZIP의 `shasum -a 256` 결과를 SHA256SUMS.txt와 비교합니다.

## 검증

[main 배포 실행](https://github.com/Polar-Little-Lab/pTerm/actions/runs/43605575806)에서 JS/TS·Rust 테스트, 앱 버전·arm64 아키텍처, Developer ID 서명, 공증 티켓 및 Gatekeeper 검증을 통과했습니다.

## 알려진 제한

공식 설치 파일은 macOS Apple Silicon용입니다. 최초 Keychain 승인과 실제 사용자 환경에서의 업데이트 간 재승인 여부는 별도 확인이 필요합니다. Touch ID 인증 정책 변경은 포함하지 않습니다.
