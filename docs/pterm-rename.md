# pTerm 이름 변경

Polarsh의 새 제품명은 **pTerm**, 패키지·실행 이름은 `pterm`입니다. 로컬 셸과 SSH를 함께 제공하며 북극곰 터미널 아이콘은 유지합니다.

## 빌드

```sh
npm --prefix app test
npm --prefix app run tauri -- build
```

macOS 결과물: `app/src-tauri/target/release/bundle/macos/pTerm.app`.

## 기존 데이터

`dev.harbor.ssh` bundle identifier, `dev.polarsh.vault.v1` 키체인 서비스, `polarsh.appearance.v1` 테마 저장 키는 기존 설치의 데이터를 읽기 위해 유지합니다. 키체인 표시 이름은 `pTerm — 호스트와 저장 명령`입니다. 기존 암호화 데이터나 계정·키를 삭제하거나 새로 만들지 않습니다.

개발 빌드의 서명이 바뀌면 macOS가 키체인 승인을 다시 요청할 수 있습니다. 이번 검증에서는 실제 사용자의 키체인을 열지 않습니다.

## 문서와 배포 이력

기존 릴리스 파일과 버전 태그는 Polarsh 이름 그대로 보존합니다. 기존 가이드 스크린샷도 당시 앱을 촬영한 기록입니다. 현재 가이드의 기능 흐름은 동일하며 표시 이름이 pTerm으로 바뀝니다. 새 저장소는 https://github.com/Polar-Little-Lab/pTerm 입니다. 과거 코드는 https://github.com/Polar-Little-Lab/polarsh 에 보존합니다.
