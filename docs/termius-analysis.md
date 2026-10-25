# Termius macOS 읽기 전용 분석

확인일: 2026-10-24. 설치본 10.2.1을 관찰했다. 최신 공식 웹 기능 설명과 설치본의 런타임 동작은 별개다. 유료 기능 활성화·라이선스 검사 변경·코드 또는 이미지 복제를 수행하지 않았다.

## 확인된 로컬 사실

| 항목 | 증거 |
|---|---|
| 경로 | `/Applications/Termius.app` |
| 버전 / bundle ID | `10.2.1`, `com.termius-dmg.mac` — Info.plist |
| 실행 파일 | `Contents/MacOS/Termius`, Mach-O 64-bit arm64 — file |
| 런타임 | Electron Framework `CFBundleVersion=43.5.1` |
| 물리적 번들 | symlink 제외 일반 파일 136개, 합계 442,801,658 bytes; 디스크 실제 점유량/RAM 아님 |
| JS 패키징 | `Contents/Resources/app.asar`와 `app.asar.unpacked` |
| ASAR 엔트리 | 디렉터리를 포함한 11,234개 목록 항목 |
| package.json | name Termius, version 10.2.1, main `main-process/main-process.js` |
| source maps | `.map` 경로 1,627개; 원본 소스 가용성/완전성을 의미하지 않음 |
| 서명 | `codesign --verify --deep --strict` exit 0 |

번들 메타데이터 (`../logs/termius-bundle.json` · 이전 개발 환경의 로컬 기록, 저장소 미포함), 네이티브 형식 (`../logs/termius-native.txt` · 이전 개발 환경의 로컬 기록, 저장소 미포함), ASAR 요약 (`../logs/termius-asar-summary.json` · 이전 개발 환경의 로컬 기록, 저장소 미포함), ASAR 전체 경로 (`../logs/termius-asar-inventory.json` · 이전 개발 환경의 로컬 기록, 저장소 미포함).

```text
Termius.app/Contents/
├── MacOS/Termius
├── Frameworks/Electron Framework.framework/
├── Info.plist
└── Resources/
    ├── app.asar
    │   ├── package.json
    │   ├── main-process/main-process.js
    │   ├── preload/preload.js
    │   ├── background-process/
    │   ├── ui-process/assets/
    │   ├── utilities-process/fido-process.js
    │   ├── node_modules/
    │   └── icons/, public/, out/
    └── app.asar.unpacked/node_modules/@termius/
```

확인된 native 패키지: `keytar`, `libfido2`, `libtermius`, `mac-single-sign-in`, `minidump-parser`, `mosh`, `node-pty`, `restore-mas-purchase`, `serialport-bindings`. `.node` 파일 14개에는 다른 OS/CPU의 minidump-parser도 포함된다. 모두 현재 Mac에서 실행되는 모듈이라고 해석하면 안 된다. `libtermius/mac-arm64/libssh2.1.dylib`도 존재한다.

**사실과 추정:** Electron+JS+native addon 혼합 앱인 것은 확인됐다. `libtermius`가 모든 SSH 연결을 담당한다거나 keytar가 모든 비밀을 macOS Keychain에 저장한다는 주장은 아직 추정이다. 파일명·의존성은 존재를 입증할 뿐 실제 호출 흐름·저장 정책을 입증하지 않는다. UI 프레임워크가 React 계열이라는 파일명 단서는 있지만 전체 번들 분석이 완료되지 않아 확정 기술 스택에는 포함하지 않았다. 패키지 버전 문자열의 `electron-22.3.27` 접미사는 실제 런타임 Electron 버전이 아니다.

## REA 실제 결과

후속 Codex MCP에서도 선택한 두 JS 모듈 분석 성공을 확인했다. 실제 호출 로그 (`../logs/codex-rea-analysis.jsonl` · 이전 개발 환경의 로컬 기록, 저장소 미포함). preload 단독 4 GiB heap 재시도는 여전히 parsed 0/skipped 1이었다. 전체 분석 완료를 주장하지 않는다. Harbor SSH 개발 현황은 [별도 문서](development-status.md)에 기록한다.

1. 기본 `inspect-artifact`는 ASAR 선언 해시와 unpacked keytar 파일의 계산 해시가 다르다는 `artifact_integrity_mismatch`를 반환했다. 원본 실패 (`../logs/rea-termius-artifact.json` · 이전 개발 환경의 로컬 기록, 저장소 미포함).
2. `record-and-continue`로 재실행한 관찰 결과에서 17개 불일치를 기록했다. 관찰된 파일은 `observed-untrusted`이며 원본 동일성 근거가 아니다. 후처리 서명/strip은 가능한 원인이지만 실제 원인은 미확정이다. codesign 통과와 ASAR 선언 해시 일치는 서로 다른 검사다.
3. 번들 inventory의 REA manifest: node 7,735 / occurrence 11,490 / edge 11,475. ASAR 내부와 중복 콘텐츠를 포함하는 그래프 값이며 물리 파일 수와 다르다. 관찰 결과 (`../logs/rea-termius-artifact-observed.json` · 이전 개발 환경의 로컬 기록, 저장소 미포함).
4. main-process 1,633,756 bytes와 preload 829,650 bytes를 선택한 정적 분석은 worker heap 1,024 MiB를 소진했다. parsed=0, skipped=2였으므로 Electron IPC 복구 성공으로 보고하지 않았다. 대형 분석 결과 (`../logs/rea-termius-javascript.json` · 이전 개발 환경의 로컬 기록, 저장소 미포함).
5. `utilities-process/fido-process.js`와 `ui-process/assets/HostsFiltersHeader-cbccb9ea.js`를 선택한 재분석은 parsed=2, skipped=0, parse_failures=0, visited_ast_nodes=7,808, findings=92였다. 읽은 텍스트 23,301 bytes. 요약 (`../logs/rea-javascript-summary.json` · 이전 개발 환경의 로컬 기록, 저장소 미포함), 전체 결과 (`../logs/rea-termius-javascript-small.json` · 이전 개발 환경의 로컬 기록, 저장소 미포함).

작은 모듈 분석 Evidence ID: `ev_85858f1516d17a5f38fb65fbb4789d3722ad66361963707e34ffaa0d83696c18`.
전체 관련 파일 8,167개 중 8,165개가 선택 범위 밖이다. findings는 정적 분석 항목 수이며 검증된 제품 기능 수가 아니다. IPC summary가 0인 것은 해당 선택 범위에서 복구되지 않았다는 뜻이지 Termius에 IPC가 없다는 뜻이 아니다.

## 분석 범위와 다음 도구

| 범위 | 이번 결과 | 추가 도구 필요성 |
|---|---|---|
| bundle/plist/ASAR 경로·해시 | 완료 | REA와 시스템 도구로 충분 |
| 작은 JS 파일 AST/import 관계 | 일부 완료 | REA로 범위별 진행 가능 |
| 대형 JS main/preload IPC 전체 | 미완료 | heap/시간 한도를 검토한 분할 분석; native decompiler로 해결되는 문제가 아님 |
| `.node` / `.dylib` 실제 구현 | 파일 존재만 확인 | 특정 interop 질문이 생길 때 Ghidra 등 검토 |
| 계정·vault·SSH 키 실제 데이터 | 범위 밖 | 사용자 데이터에 접근하지 않음 |
| 실행 중 네트워크·프로세스 주입 | 범위 밖 | 수행하지 않음 |
| 속도·CPU·RAM 비교 | 미측정 | 별도 synthetic test와 동등 조건 baseline 필요 |

Ghidra를 설치한다면 macOS arm64 native decompiler와 해당 Ghidra 릴리스 요구 JDK를 확인해야 한다. 지금 설치하지 않은 이유는 초기 구조 분석에 불필요하며 독립 SSH 구현은 공개 프로토콜/라이브러리로 설계 가능하기 때문이다.

## 원본 보존과 기록

읽기 전용 검증 (`../logs/readonly-verification.json` · 이전 개발 환경의 로컬 기록, 저장소 미포함): 번들 일반 파일 목록·크기·mtime 전후 동일. Info.plist, 실행 파일, ASAR SHA-256 전후 동일. ASAR SHA-256은 `b9d10de84225dc6f29a3e824344923896134056cb58692c45337fb7b7ef83c04`.

REA는 target을 실행하지 않고 파일을 정적 텍스트/바이트로 읽었다. 사용자 프로필·설정·계정·SSH 키·자격증명 저장소는 조사하지 않았다. 실제 코드/리소스를 새 앱 저장소로 추출하지 않았으며, 메타데이터·분석 Evidence만 기록했다. Evidence는 분석 자료로만 사용하고 향후 구현에는 공개 문서로 다시 기술한 요구사항을 넘긴다. 동일 작업자가 분석·설계했으므로 엄격한 인적 clean-room 분리를 달성했다고 주장하지 않는다.
