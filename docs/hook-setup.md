# Hook 연결 (수동)

CodeMung은 Claude Code와 Codex의 hook을 통해 상태를 받는다. 자동 설치 도구는 다음 슬라이스에서 만들고, 지금은 사용자 설정 파일을 직접 편집한다.

두 도구 모두 stdin으로 같은 모양의 JSON(`session_id`, `hook_event_name`, `cwd`)을 넘기므로 bridge 스크립트는 하나다. Provider만 인자로 구분한다.

## 사전 준비

```bash
npm run build
```

`out/main/hook-bridge.js`가 만들어져야 한다.

hook은 비대화형 셸에서 실행되므로 nvm으로 설치한 `node`는 보통 `PATH`에 없다. bridge는 설계상 조용히 종료하기 때문에, 이 경우 아무 오류도 뜨지 않고 그냥 아무 일도 일어나지 않는다. `node`의 절대 경로를 먼저 확인한다.

```bash
which node
# 예: /Users/me/.nvm/versions/node/v22.14.0/bin/node
```

아래 설정에서 `<NODE>`는 위에서 확인한 절대 경로로, `<REPO>`는 이 저장소의 절대 경로로 바꿔 쓴다.

## 설정 백업

전역 설정을 고치므로 먼저 백업한다.

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.bak
cp ~/.codex/hooks.json ~/.codex/hooks.json.bak 2>/dev/null || true
```

## Claude Code

`~/.claude/settings.json`의 `hooks` 객체에 아래 다섯 항목을 병합한다. 이미 같은 이벤트에 다른 hook이 등록돼 있으면, 그 이벤트의 배열에 항목을 **추가**한다. 덮어쓰지 않는다.

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "<NODE> <REPO>/out/main/hook-bridge.js claude" }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "<NODE> <REPO>/out/main/hook-bridge.js claude" }] }
    ],
    "PermissionRequest": [
      { "hooks": [{ "type": "command", "command": "<NODE> <REPO>/out/main/hook-bridge.js claude" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "<NODE> <REPO>/out/main/hook-bridge.js claude" }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "<NODE> <REPO>/out/main/hook-bridge.js claude" }] }
    ]
  }
}
```

### 병합 예시

`SessionStart`에 이미 hook이 하나 등록돼 있다면, 배열을 덮어쓰지 말고 CodeMung 항목을 뒤에 덧붙인다.

병합 전:

```json
"SessionStart": [
  { "hooks": [{ "type": "command", "command": "/usr/local/bin/my-session-logger" }] }
]
```

병합 후:

```json
"SessionStart": [
  { "hooks": [{ "type": "command", "command": "/usr/local/bin/my-session-logger" }] },
  { "hooks": [{ "type": "command", "command": "<NODE> <REPO>/out/main/hook-bridge.js claude" }] }
]
```

## Codex

`~/.codex/hooks.json`에 같은 구조를 쓴다. Codex는 `SessionEnd` hook이 없으므로 네 개만 등록한다.

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "<NODE> <REPO>/out/main/hook-bridge.js codex" }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "<NODE> <REPO>/out/main/hook-bridge.js codex" }] }
    ],
    "PermissionRequest": [
      { "hooks": [{ "type": "command", "command": "<NODE> <REPO>/out/main/hook-bridge.js codex" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "<NODE> <REPO>/out/main/hook-bridge.js codex" }] }
    ]
  }
}
```

설정이 인식되는지 확인한다.

```bash
codex doctor
```

## 확인

1. `npm run dev`로 companion을 띄운다.
2. 새 터미널에서 Claude Code를 실행하고 아무 질문이나 던진다.
3. 프롬프트를 보내는 순간 용암이 빨라지고(`working`), 답변이 끝나면 완료 모션 후 약 4초 뒤 가라앉는다(`idle`).
4. 승인이 필요한 도구를 쓰면 용암이 느려지면서 밝아진다(`waiting_permission`). 가장 밝은 상태는 `completed`다.
5. Codex에서 같은 순서를 반복한다.

## 되돌리기

**Case 1: 설정 파일이 이미 있던 경우**

설정 파일을 백업 파일로 되돌린다.

```bash
mv ~/.claude/settings.json.bak ~/.claude/settings.json
```

`~/.codex/hooks.json`이 이미 있었으면:

```bash
mv ~/.codex/hooks.json.bak ~/.codex/hooks.json
```

**Case 2: Codex 설정 파일이 없었던 경우**

`~/.codex/hooks.json`을 처음 만들었다면, 백업 파일이 없다. 위에서 추가한 CodeMung hook 항목만 지우거나 파일 전체를 지운다.

```bash
# 파일 전체 삭제 (가장 간단함)
rm ~/.codex/hooks.json

# 또는, 다른 hook이 있으면 CodeMung 항목만 지우기:
# ~/.codex/hooks.json을 열어서 SessionStart, UserPromptSubmit, PermissionRequest, Stop 항목을 지운다.
```

## 알려진 한계

- Codex에는 `SessionEnd` hook이 없어 종료된 Codex 세션이 store에 마지막 상태 그대로 남는다. 마지막 상태가 `completed`였다면 잠시 뒤 `idle`로 가라앉지만, 승인 대기 중이거나 실패한 채로 Codex를 끄면 `waiting_permission`이나 `error`로 남는다. 이 둘은 우선순위가 높아서 화면이 계속 그 상태에 묶인다. 앱을 재시작하면 정리된다.
- 승인 요청은 프롬프트가 뜰 때만 이벤트가 오고 승인 직후에는 아무 이벤트도 오지 않는다. 그래서 승인해서 작업이 다시 돌아가도 그 턴이 끝날 때(`Stop`)까지 화면은 `waiting_permission`으로 남는다.
- `PreToolUse`와 `SubagentStop`은 연결하지 않는다. 전자는 모든 도구 호출에 지연을 더하고, 후자는 subagent가 끝날 때마다 완료로 오인된다.
- companion이 꺼져 있으면 bridge는 아무것도 보내지 않고 즉시 정상 종료한다. AI 작업은 영향을 받지 않는다.
