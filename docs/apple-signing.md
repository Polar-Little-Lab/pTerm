# Apple Developer ID 서명과 공증

GitHub 외부 배포용 절차입니다. 같은 Apple 개발자 팀의 Developer ID Application 인증서를 여러 앱에 사용할 수 있습니다. 기존 사용자 데이터 호환성을 위해 pTerm의 Bundle ID `dev.harbor.ssh`는 유지합니다.

## GitHub Actions 배포 (기본)

`.github/workflows/macos-release.yml`에서 빌드 → Developer ID 서명 → Apple 공증 → 티켓 검증 → ZIP 생성 순서로 실행합니다. 공증이나 검증에 실패하면 배포하지 않으며 ad-hoc 서명으로 대체하지 않습니다.

pGit과 같은 이름으로 다음 Actions Secrets를 pTerm 저장소에 등록하거나, 조직 Secret의 허용 저장소에 pTerm을 추가합니다.

| Secret | 값 |
| --- | --- |
| `APPLE_CERTIFICATE_P12_BASE64` | 개인 키를 포함한 Developer ID Application 인증서의 PKCS#12 파일을 Base64로 인코딩한 값 |
| `APPLE_CERTIFICATE_PASSWORD` | 해당 PKCS#12 파일 암호 |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: 이름 (TEAMID)` |
| `APPLE_API_KEY_BASE64` | Apple API 개인 키 `.p8` 파일의 Base64 값 |
| `APPLE_API_KEY_ID` | 해당 API 키 ID |
| `APPLE_API_ISSUER` | 해당 팀 API 키 Issuer ID |

GitHub에 저장된 Secret은 API로 원래 값을 읽어 복사할 수 없습니다. 원본 인증서/키로 등록해야 합니다. 같은 팀의 인증서와 API 키를 사용할 수 있습니다. pGit의 `APPLE_SIGNING_ENABLED` 변수는 pTerm에서는 사용하지 않습니다. 이 워크플로는 정식 서명을 필수로 요구합니다.

Actions의 **macOS release → Run workflow**에서 `publish=false`(기본값)로 실행하면 검증된 ZIP을 Actions artifact로만 저장합니다. 새 버전과 릴리스 문서가 준비된 뒤 `publish=true`로 실행하거나 기존 main 자동 배포 트리거를 사용합니다. 공개된 버전과 자산을 덮어쓰지 않습니다.

로컬 Keychain 공증 프로필이나 앱 전용 암호는 Actions 방식에는 필요 없습니다. 다음은 로컬에서 직접 배포할 때만 사용하는 보조 절차입니다.

## 로컬 최초 설정

`security find-identity -v -p codesigning`에서 유효한 Developer ID Application 인증서를 확인합니다. 인증서의 개인 키는 macOS Keychain에 보관합니다.

공증 자격 증명은 본인의 터미널에서 아래 명령으로 등록합니다. Apple ID와 Team ID, 앱 전용 암호는 대화형 프롬프트에 입력합니다. 일반 Apple 계정 암호가 아니라 account.apple.com에서 발급한 앱 전용 암호를 사용합니다. 암호를 소스, 채팅, 명령행 인수에 넣지 않습니다.

```sh
xcrun notarytool store-credentials pTerm
```

## 서명 빌드

```sh
APPLE_SIGNING_IDENTITY='Developer ID Application: YOUR NAME (TEAMID)' ./scripts/app-build-signed
```

개발용 빌드와 별도로 Developer ID 서명과 Hardened Runtime을 적용합니다. Tauri 공증 환경 변수가 없다면 빌드에서 공증을 건너뛰었다는 경고가 나올 수 있습니다. 다음 단계가 공증을 처리합니다.

## 공증과 검증

```sh
./scripts/app-notarize app/src-tauri/target/release/bundle/macos/pTerm.app
```

다른 Keychain 프로필은 `--profile NAME`으로 지정합니다. Apple 처리가 10분을 넘으면 출력된 ID로 같은 명령에 `--submission-id ID`를 추가하여 재개합니다. 재개할 때 앱을 다시 빌드하거나 수정하지 않습니다.

스크립트는 서명·보안 타임스탬프·Hardened Runtime을 확인하고 Apple에 제출합니다. 승인 후 티켓 첨부, stapler 검증, 서명 무결성, Gatekeeper 검증을 모두 통과해야 `.tools/signed-release/`에 ZIP과 체크섬을 만듭니다. 기존 ZIP은 덮어쓰지 않습니다. 제출 ID도 이 디렉터리에 남습니다.

이미 공개한 릴리스 자산은 교체하지 않고, 버전과 릴리스 문서를 갱신한 새 릴리스로 배포합니다.

공식 문서: [Apple Developer ID](https://developer.apple.com/developer-id/), [Tauri macOS 서명](https://v2.tauri.app/distribute/sign/macos/).
