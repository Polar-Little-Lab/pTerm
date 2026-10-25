# pTerm 릴리스 관리

- `main`: 다음 배포를 위한 통합 코드
- `release/1.0`: pTerm 1.0.x 유지보수
- `v1.0.0`: 첫 정식 배포 태그

수정은 1.0.1, 기능 추가는 1.1.0으로 올립니다. 배포된 태그와 파일은 덮어쓰지 않습니다.
package.json·package-lock.json·Cargo.toml·Cargo.lock·tauri.conf.json·화면 버전을 맞춘 뒤 JS/Rust 테스트와 앱 빌드를 검증합니다. 앱 ZIP과 SHA-256 체크섬을 릴리스에 올립니다.
Polarsh의 과거 브랜치·태그는 기존 저장소에서 보존합니다.
