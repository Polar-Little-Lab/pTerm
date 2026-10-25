# REA 설치와 Codex MCP 연결

확인일: 2026-10-24. 배포: npm `rea-agents@6.7.0` (`latest`, prerelease 아님).

공식 근거: [REA README](https://github.com/morluto/rea), [설치 문서](https://github.com/morluto/rea/blob/main/docs/installation.md), [OpenAI MCP 문서](https://developers.openai.com/codex/mcp).
macOS arm64에서 Node 기반 정적 분석은 지원된다. native decompile은 별도 provider가 필요하다.

## 실제 실행한 설치

프로젝트 루트에서 실행했다. 패키지 버전은 고정하며 기존 Node를 교체하지 않는다.

```sh
npm view rea-agents version engines dist-tags repository --json
npm install --prefix .tools/runtime --no-audit --no-fund node@24.22.1
PATH="$PWD/.tools/runtime/node_modules/.bin:$PATH" \
  npm install --prefix .tools/rea --no-audit --no-fund rea-agents@6.7.0
```

`--no-audit`는 설치 중 자동 감사 요청을 생략한 것이다. 취약점이 없다는 보장은 하지 않는다. `prebuild-install` 전이 의존성의 deprecated 경고는 있었지만 설치는 exit 0이었다.

편의 실행기: [scripts/rea](../scripts/rea). 스크립트는 전용 Node를 PATH 앞에 두고 공식 `rea.mjs`를 실행한다.

## 등록과 수정 이력

1. `codex mcp list --json`으로 기존 등록을 저장했다. 전체 결과는 private 로그이며 배포하지 않는다.
2. `~/.codex/config.toml.before-rea-20261024`에 기존 설정을 0600 백업했다.
3. `scripts/rea setup --client codex --skill=false --dry-run --json`으로 공식 계획을 확인했다.
4. 처음에는 `codex mcp add rea -- "$PWD/scripts/rea" mcp`로 등록했다. 연결용 wrapper는 실행 가능했지만 REA doctor가 canonical launcher와 다르다고 `config_drift`로 판정했다.
5. `scripts/rea setup --client codex --skill=false --yes --json`으로 공식 direct launcher를 적용했다. 사용자 지시가 설치·설정 변경을 명시적으로 승인하므로 추가 승인 질문 없이 Codex만 선택했다. Hopper나 다른 에이전트는 설치/설정하지 않았다.
6. REA 서버의 `env.PATH`에 전용 Node를 지정했다. unrelated 설정 및 기존 MCP는 보존했다.

최종 `~/.codex/config.toml`의 REA 항목은 아래와 같다. 실제 timeout 값은 등록 JSON (`../logs/rea-registration.json` · 이전 개발 환경의 로컬 기록, 저장소 미포함)을 기준으로 한다.

```toml
[mcp_servers.rea]
command = "/Users/polar/Desktop/reverse-engineering/.tools/rea/node_modules/rea-agents/scripts/rea.mjs"
args = ["mcp"]
startup_timeout_sec = 30
tool_timeout_sec = 450

[mcp_servers.rea.env]
PATH = "/Users/polar/Desktop/reverse-engineering/.tools/runtime/node_modules/.bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
```

REA workflow skill은 `--skill=false`로 설치하지 않았다. MCP 동작의 필수 조건은 아니다. 기존 personal skills를 바꾸지 않았다. setup은 별도 `config.toml.rea.backup`도 생성했다. 전체 설정 백업에는 다른 서버 정보가 들어갈 수 있으므로 공개 저장소에 넣지 않는다.

## 초기 검증과 실패 이력

**후속 해결:** Codex `exec --approve-for-me` 자동 승인 검토에서 open_binary 및 선택 JS 분석이 실제 실행됐다. 호출 로그 (`../logs/codex-rea-analysis.jsonl` · 이전 개발 환경의 로컬 기록, 저장소 미포함), [현재 검증 결과](development-status.md). 아래 승인 차단과 남은 검증 설명은 해결 전 이력이다. 전역 정책은 변경하지 않았다.

```sh
scripts/rea --version
codex mcp get rea --json
scripts/rea doctor --client codex --target /Applications/Termius.app --json
.tools/runtime/node_modules/.bin/node scripts/mcp-discovery.mjs
```

- 최종 scoped doctor: `healthy=true`, Node·target·Codex registration 모두 정상. `environment_healthy` 및 다른 provider/skill 안내는 scoped 결과와 별개다.
- MCP stdio `initialize`: server `rea`, version `6.7.0`.
- `tools/list`: 207개 도구. 발견 결과 (`../logs/mcp-discovery.json` · 이전 개발 환경의 로컬 기록, 저장소 미포함). 이 스크립트는 분석 도구를 호출하지 않는다.
- 새 `codex exec --ephemeral --sandbox read-only`에서 실제 `rea` MCP 호출을 요청했다. gateway가 승인 필요/정책 never 사유로 실행 전에 차단했다. 첫 호출 로그 (`../logs/codex-rea-smoke.jsonl` · 이전 개발 환경의 로컬 기록, 저장소 미포함), 재검증 로그 (`../logs/codex-rea-smoke-final.jsonl` · 이전 개발 환경의 로컬 기록, 저장소 미포함).
- 재검증에서 특정 도구의 CLI 일회성 approval 설정을 시도했지만 동일하게 차단됐다. 전역 승인 정책·sandbox·macOS 보안 설정은 변경하지 않았다. 이를 우회하는 추가 호출은 하지 않았다.
- 발견한 실제 스키마에서 `inspect_artifact`는 path 인자를 받지 않고 활성 artifact를 분석한다. MCP에서는 먼저 `open_binary`로 대상을 선택해야 한다. CLI의 `inspect-artifact <path>`와 혼동하면 안 된다. 첫 테스트의 path 직접 전달은 스키마와 맞지 않았으며, 승인 차단 때문에 서버에서 평가되지도 않았다. 두 번째 Codex는 `open_binary` → `inspect_artifact`를 시도했으나 둘 다 승인 단계에서 차단됐다.
- `inspect_artifact`는 설명상 읽기 중심이지만 MCP annotation이 `readOnlyHint=false`다. 이것은 승인 요구의 가능한 원인이며 gateway 내부 원인까지 검증한 것은 아니다.

**남은 검증:** 승인을 처리할 수 있는 대화형 Codex 세션에서 `/mcp`를 확인하고, `/Applications/Termius.app/Contents/Resources/app.asar`를 `open_binary`로 선택한 뒤 `inspect_artifact`를 호출한다. 기본 integrity 정책은 fail이므로 기존 불일치가 다시 보고될 수 있다. 모든 도구 승인을 일괄 해제하지 말고 해당 읽기 전용 조사만 승인한다. 현재 세션의 도구 카탈로그는 설치로 자동 갱신되지 않으므로 새 세션이 필요하다.

## 재현 가능한 CLI 분석

```sh
scripts/rea inspect-artifact /Applications/Termius.app --json
# 기본 정책의 integrity mismatch를 보존한 후, 구조 관찰용으로만:
scripts/rea inspect-artifact /Applications/Termius.app \
  --integrity-policy record-and-continue --json
scripts/rea analyze-javascript-application \
  /Applications/Termius.app/Contents/Resources/app.asar \
  --source-path utilities-process/fido-process.js \
  --source-path ui-process/assets/HostsFiltersHeader-cbccb9ea.js \
  --max-heap-mb 1024 --analysis-timeout-ms 60000 \
  --integrity-policy record-and-continue --json
python3 scripts/verify-readonly.py
```

위 관찰 옵션은 macOS 보호나 서명 검사를 끄지 않는다. 선언과 다른 파일을 신뢰 대상으로 승격시키지도 않으며, REA가 `observed-untrusted`로 기록한다. 결과의 equivalence/원본 동일성 주장에는 사용하지 않는다.

큰 main/preload 번들 분석은 1 GiB worker heap 소진으로 2개 모두 skipped됐다. exit 0이어도 분석 성공으로 판단하지 않고 statistics/limitations를 확인했다. 작은 모듈 2개로 범위를 좁혀 parse 성공을 확인했다. 주요 로그 목록은 [분석 문서](termius-analysis.md)에 있다.

업데이트는 검증한 새 REA 버전을 동일 prefix에 설치하고 setup 계획을 다시 확인한다. npm lockfile을 보존하며, Node 지원 조건과 wrapper 경로를 함께 점검한다. Ghidra는 설치하지 않았다. Rust는 후속 앱 개발을 위해 설치했다.
