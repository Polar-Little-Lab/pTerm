# pTerm 동작 보존 기준

- SSH·Local Shell, 호스트 저장/편집, 명령 저장과 연결 흐름: `docs/feature-matrix.md`, `docs/user-guide.md`를 기준으로 확인합니다.
- Vault 잠금/해제·Keychain 자격증명·호스트 데이터 유지: `docs/saved-credentials.md`, `docs/apple-signing.md`. 서명 변경과 인증 정책 변경을 혼동하지 않습니다.
- UI는 `docs/design-system.md`와 기존 컴포넌트를 유지합니다. 의도적인 변경은 전후 화면과 사용자 영향을 기록합니다.
- Bundle ID `dev.harbor.ssh`, 저장 경로와 포맷을 의도 없이 바꾸지 않습니다.
- 현재 공식 배포는 macOS Apple Silicon ZIP이며 다른 플랫폼 지원을 노트에 주장하지 않습니다.

검증: `npm test --prefix app`, `npm run build --prefix app`, `cargo +1.90.0 test --manifest-path app/src-tauri/Cargo.toml --locked`. 실제 SSH 연결·최초 Keychain 승인 등 자동화되지 않은 검사는 수동 확인 결과와 미확인을 구분합니다. 기존 `docs/release-verification.md`도 확인합니다.
