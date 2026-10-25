# 개발자 계정 없는 로컬 서명 검토

2026-10-24

## 정정

Apple 개발자 계정이 없으면 반복 Keychain 승인을 개선할 방법이 없다는 의미는 아니다. 기존 파일 기반 Keychain은 앱의 designated requirement로 앱 동일성을 추적하며, 자체 서명 인증서도 이 용도로 사용할 수 있다. Data Protection Keychain의 userPresence/entitlement 이전과는 별개의 경로다.

Apple 문서: https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/AboutCS/AboutCS.html (Code Signature Evaluation)

## 이번 작업

- `scripts/setup-local-signing.py`로 `Terminal Local Development` RSA 3072 코드 서명 키를 현재 사용자 기본 Keychain에 생성·가져옴.
- 개인 키는 Keychain에 보관. 임시 개인 키/PKCS12 파일은 제거. 공개 인증서만 `.tools/local-signing/certificate.pem`에 보관.
- 새 개인 키의 허용 도구는 `/usr/bin/codesign`. 모든 앱 허용(-A), 기존 Vault ACL 수정, 시스템 인증서 신뢰 추가, Gatekeeper 설정 변경을 하지 않음.
- 지문: `285932B85F0EFEEE2A273426DEDE032ACCF19B34`.
- 현재 trust 정책상 자체 서명 인증서가 NOT_TRUSTED로 표시됨. 시스템 신뢰를 부여해 이 표시를 없애지 않음.
- 최초 disposable 실행 파일 서명 테스트는 35초 내 끝나지 않아 중단. 시스템 키 사용 승인 때문인지 사용자 확인 대기. 성공으로 기록하지 않음.
- `scripts/verify-local-signing.py` 준비: 서로 다른 두 테스트 바이너리를 서명하고 certificate-bound DR 동일성과 서명 무결성을 검증. 테스트는 Vault를 읽지 않음.
- 앱 빌드 파이프라인 및 현재 앱은 아직 변경하지 않음. 현재 앱의 Touch ID → 기존 Keychain 접근 흐름도 유지.

## 남은 단계

1. 로컬 키를 이용한 codesign 테스트 완료. 시스템 승인창이 나오면 사용자가 직접 처리.
2. 두 빌드 사이 DR이 유지되는 것을 검증한 뒤 빌드에 같은 인증서 사용을 통합.
3. 앱 재시작 시 기존 Keychain 항목에 대한 macOS의 접근 승인을 사용자가 처리. 기존 ACL 자동 수정이나 키 삭제는 하지 않음.
4. 잠금/Touch ID 해제 반복, 앱 재실행, 재빌드 후 해제를 확인. 로그인 Keychain 자체가 잠긴 상황 등 별도 암호가 필요한 경우를 구분.

이 경로는 Touch ID로 Keychain 항목 자체를 보호하는 구현이 아니다. 기존 앱 레벨 Touch ID 확인 + 파일 기반 Keychain의 안정된 앱 신원을 결합하는 개발용 경로이며, 반복 암호창 제거 여부는 아직 검증 전이다. 공개 배포용 Developer ID/공증을 대체하지 않는다.
