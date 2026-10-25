# macOS 제목 표시줄 테마 동기화

2026-10-25

제목 표시줄 배경을 선택한 테마의 상단 탭 바와 같은 색으로 표시합니다. 테마를 바꾸거나 앱을 다시 시작할 때 저장된 설정을 적용합니다.

- 각 프리셋의 `soft` 색상을 탭 바와 제목 표시줄이 공유합니다. Frost는 `#e7eff6`, Paper는 `#eee8dd`, Arctic은 `#1b3040`입니다.
- macOS 기본 닫기·최소화·확대 버튼과 네이티브 제목 표시줄을 유지합니다.
- 제목과 기본 컨트롤의 명암도 테마의 라이트·다크 설정에 맞춥니다.
- Mac 설정 따라가기는 네이티브 테마 강제 지정을 해제하고 시스템 변경에 따라 색상을 다시 적용합니다.

`tauri.conf.json`의 `titleBarStyle: "Transparent"`로 기본 제목 표시줄 배경을 투명하게 만들고, `useAppearance.ts`에서 `Window.setBackgroundColor(preset.soft)`를 호출합니다. 콘텐츠를 제목 표시줄 위로 확장하는 Overlay 방식은 사용하지 않습니다.

`Window.setTheme()`와 배경색 호출을 순서대로 처리하며 각각의 중복 요청을 생략합니다. 같은 밝기인 Frost에서 Paper로 전환해도 배경색은 갱신됩니다. 브라우저 미리보기에서는 네이티브 API를 호출하지 않습니다.

시스템 모드에서는 `setTheme(null)`을 사용합니다. macOS 앱 appearance를 강제하면 WebView의 `prefers-color-scheme`에도 영향을 주므로 시스템 추적을 유지하기 위한 처리입니다.

권한은 메인 창에 `core:window:allow-set-theme`와 `core:window:allow-set-background-color`만 추가했습니다.

참고: [Tauri 제목 표시줄 커스터마이징](https://v2.tauri.app/learn/window-customization/#macos-transparent-titlebar-with-custom-window-background-color), [Tauri Window API](https://v2.tauri.app/reference/javascript/api/namespacewindow/)

## 검증

- `node --test scripts/qa/theme.test.mjs`: 3개 통과.
- `scripts/app-build`: TypeScript·Vite 및 macOS release 번들 빌드 성공.
- 별도 데이터 영역을 사용하는 QA 앱에서 Paper 저장 설정 재실행, Paper → Frost → Arctic 전환을 확인했습니다. 세 테마 모두 제목 표시줄과 탭 바가 같은 색으로 이어집니다.
- 최종 번들의 ad-hoc 코드 서명 및 `codesign --verify --deep --strict` 검증을 완료했습니다.
- OS 자체 라이트·다크 설정 변경에 대한 자동 전환은 이번 수동 검증 범위에 포함하지 않았습니다.

이 개선은 기존 문서 이력과 함께 GitHub v1.0.0 소스 태그 및 Apple Silicon 앱 ZIP에 포함합니다.
