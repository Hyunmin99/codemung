# CodeMung 컴패니언 상호작용 설계

작성일: 2026-07-24
상태: 승인됨

## 1. 목적

CodeMung의 떠 있는 object를 단순 상태 애니메이션에서 직접 만지고 설정할 수 있는 데스크톱 컴패니언으로 확장한다.

이번 설계는 다음 경험을 제공한다.

- object를 drag해 창 위치를 옮긴다.
- object를 click하면 현재 Agent 상태와 테마에 맞게 반응한다.
- 창 가장자리를 drag해 정사각형 비율로 크기를 조절한다.
- 우클릭 패널에서 활성 Agent 상태를 확인하고 테마와 sound를 설정한다.
- 용암멍과 물멍을 선택한다.
- click에는 테마별 유기음을, 중요 상태 변화에는 공통 UI chime을 재생한다.

## 2. 범위

### 포함

- object click과 drag 판정
- 창 위치 이동과 저장
- 정사각형 자유 resize와 크기 저장
- 용암멍·물멍 `CompanionPack`
- 상태별 click reaction
- 우클릭 상태·설정 패널
- 활성 Claude·Codex session 집계 표시
- click sound와 중요 상태 알림음
- theme, volume, mute, always-on-top, window bounds 저장
- fixture 기반 `SessionSnapshot`
- 자동 테스트와 production build 검증

### 제외

- 실제 Claude Code·Codex hook 연결
- 사용량·비용·reset 시각 조회
- 외부 사용자가 설치하는 third-party plugin
- ambient sound 연속 재생
- 용암멍·물멍 외 추가 테마
- 장기 session history

실제 Provider 연결은 다음 작업에서 `SessionSnapshot` adapter를 교체해 추가한다.

## 3. 제품 결정

### 3.1 Pointer interaction

- 좌클릭은 현재 상태별 reaction과 테마별 유기음을 실행한다.
- pointer가 처음 누른 위치에서 5px 미만 움직이면 click이다.
- 5px 이상 움직이면 drag로 전환하고 click reaction과 sound를 취소한다.
- drag는 object 자체에서 시작할 수 있어야 한다.
- 우클릭은 drag나 click reaction을 실행하지 않고 상태·설정 패널을 연다.
- click reaction은 120ms cooldown을 사용한다.
- interaction sound는 최대 4개까지 겹칠 수 있고, 상태 UI chime은 한 번에 1개만 재생한다.
- reduced-motion이 활성화되면 click reaction의 이동량과 반복을 줄인다.

상태별 기본 reaction:

| 상태 | Reaction |
| --- | --- |
| `idle` | 말랑하게 눌렸다 복원 |
| `working` | 움직임 가속과 작은 입자 |
| `waiting_permission` | 강한 pulse |
| `completed` | 밝게 팽창한 뒤 복원 |
| `error` | 짧은 recoil과 떨림 |

Reaction은 상태를 변경하거나 permission을 승인하지 않는다. 시각·청각 피드백만 제공한다.

### 3.2 창 이동과 resize

- 창은 object drag로 이동한다.
- 창 가장자리와 모서리는 native resize 영역으로 동작한다.
- `BrowserWindow.setAspectRatio(1)`로 정사각형 비율을 유지한다.
- 허용 크기는 180px부터 480px까지다.
- resize 중 object는 늘어나지 않고 현재 창의 짧은 축에 맞춰 같은 비율로 scale한다.
- 이동과 resize가 끝나면 window bounds를 저장한다.
- 저장된 bounds가 현재 display 밖이면 가장 가까운 display의 work area 안으로 보정한다.
- monitor 구성이 바뀌어도 창 전체가 접근 가능한 위치에 남아야 한다.

### 3.3 우클릭 패널

선택한 구조는 `상태 헤더 + 익숙한 메뉴`다.

상태 영역:

- 활성 session이 있는 Provider만 표시한다.
- Claude와 Codex가 모두 활성이면 두 Provider를 각각 한 줄로 표시한다.
- Provider별 대표 상태와 활성 session 수를 표시한다.
- Provider 행을 선택하면 session 목록을 펼친다.
- 각 session에는 전체 경로 대신 마지막 디렉터리 이름만 표시한다.
- 활성 session이 없으면 `현재 활성 작업 없음`을 표시한다.

활성 session 정의:

- `working`, `waiting_permission`, `error` 상태는 활성이다.
- `completed`는 완료 후 5초 동안 활성으로 표시한 뒤 `idle`로 전환한다.
- `idle`과 종료된 session은 패널에서 숨긴다.

표시 예:

```text
Claude  작업 중   · 3개
Codex   확인 필요 · 2개
```

Provider 대표 상태 우선순위:

```text
waiting_permission > error > completed > working > idle
```

설정 영역:

- 테마: `용암멍`, `물멍`
- sound 전체 mute
- sound volume
- 항상 위
- 앱 종료

패널은 바깥 click, `Esc`, 창 focus 해제 시 닫힌다.

### 3.4 테마

용암멍과 물멍은 같은 companion 문법을 사용한다. 둘 다 상태를 표현하는 하나의 중심 object이며 click에 물리적으로 반응한다.

- 용암멍: 기존 metaball 기반의 따뜻한 유체
- 물멍: 물방울 생명체 형태의 차가운 유체

테마를 바꿔도 현재 Agent 상태, session snapshot, 창 위치, 창 크기는 유지한다. motion과 interaction sound만 새 pack으로 즉시 교체한다.

### 3.5 Sound

sound는 두 계층으로 나눈다.

1. 테마별 interaction sound
   - 용암: `톡`, `보글`, 작은 불꽃
   - 물: `퐁`, `찰랑`, 작은 방울
2. 테마 공통 상태 UI chime
   - `waiting_permission`: 또렷한 2음
   - `completed`: 상승하는 2음
   - `error`: 낮은 단음

정책:

- 기본값은 ON, global volume 30%다.
- interaction과 상태 알림은 같은 global mute와 volume을 사용한다.
- 짧은 원본 `.wav` asset을 앱에 포함한다.
- interaction sound는 작은 pitch variation을 적용해 반복감을 줄인다.
- 상태가 실제로 바뀔 때만 UI chime을 재생한다.
- 초기 snapshot hydrate에서는 알림음을 재생하지 않는다.
- click reaction은 120ms cooldown을 사용한다.
- interaction sound는 최대 4개, 상태 UI chime은 최대 1개까지 동시에 재생한다.
- 출력 장치 부재, autoplay 제한, decode 실패는 앱 흐름을 막지 않고 조용히 무시한다.
- 외부 음원 라이선스에 의존하지 않는다.

## 4. Architecture

계약 중심 module 구조를 사용한다. 현재는 내장 pack만 등록하지만, 안정된 seam을 유지해 내부 plugin형 구조로 확장할 수 있게 한다.

### 4.1 `SessionStore`

책임:

- session별 상태 보관
- Provider별 활성 session과 대표 상태 계산
- 화면 대표 상태 계산
- immutable `SessionSnapshot` 발행

Interface:

```ts
interface SessionStore {
  getSnapshot(): SessionSnapshot
  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void
}
```

이번 범위에서는 fixture adapter가 snapshot을 공급한다. 실제 Claude·Codex adapter는 다음 작업에서 같은 seam에 연결한다.

### 4.2 `WindowManager`

책임:

- pointer drag delta를 창 위치로 반영
- 정사각형 aspect ratio와 최소·최대 크기 적용
- display work area 안으로 bounds 보정
- 이동·resize 완료 후 bounds 저장

renderer는 preload가 공개한 최소 interface만 사용한다. 좌표와 크기 검증은 main process에서도 반복한다.

### 4.3 `CompanionRegistry`

책임:

- pack ID로 `CompanionPack` 조회
- 잘못된 ID에 `lava` fallback 제공
- 등록된 테마 목록 제공

Interface:

```ts
interface CompanionPack {
  id: string
  label: string
  Motion: React.ComponentType<MotionPackProps>
  states: Readonly<Record<AgentState, MotionParams>>
  interactions: Readonly<Record<AgentState, InteractionDefinition>>
  sounds: InteractionSoundPack
}
```

`CompanionRegistry`가 pack 구현 세부사항을 숨긴다. 화면과 controller는 `lava` 또는 `water`의 내부 파일 구성을 알지 않는다.

### 4.4 `InteractionController`

책임:

- pointer down부터 이동 거리를 추적
- 5px threshold로 click과 drag 분류
- drag 시작 시 pending click 취소
- 현재 상태와 pack에 맞는 reaction 요청
- click sound 재생 요청
- 연속 입력 중첩 제한

Interface는 pointer 입력과 판정 결과만 다룬다. 창 이동, React animation, audio 재생 구현은 주입된 adapter에 맡긴다.

### 4.5 `AudioManager`

책임:

- sound asset preload와 decode
- global mute와 volume 적용
- interaction pitch variation
- 상태 전환 chime 선택
- 동시 재생 수와 cooldown 제한
- 재생 실패 격리

Web Audio 구현을 production adapter로 사용하고, 테스트에서는 in-memory adapter를 사용한다.

### 4.6 `PreferencesStore`

저장 항목:

```ts
interface CompanionPreferences {
  themeId: string
  soundEnabled: boolean
  volume: number
  alwaysOnTop: boolean
  windowBounds: { x: number; y: number; width: number; height: number }
}
```

읽을 수 없거나 검증에 실패한 값은 항목별 기본값으로 복구한다. 유효한 다른 항목까지 함께 폐기하지 않는다.

## 5. Data flow

### 5.1 상태 변화

```text
Fixture Session Adapter
  -> SessionStore
  -> SessionSnapshot
  -> 활성 Provider 집계
  -> scene 대표 상태 + 우클릭 패널
  -> 이전 snapshot과 비교
  -> 중요 상태 변화면 AudioManager UI chime
```

### 5.2 Click과 drag

```text
Pointer input
  -> InteractionController
  -> 5px 미만: CompanionPack reaction + AudioManager interaction sound
  -> 5px 이상: WindowManager drag
```

### 5.3 테마 변경

```text
우클릭 메뉴 선택
  -> PreferencesStore
  -> CompanionRegistry
  -> Motion + interaction mapping + sound pack 교체
```

## 6. 내부 plugin 구조로의 진화

계약 중심 구조에서 내부 plugin형 구조로의 변경은 가능하다.

- 현재: `lava`와 `water`를 build-time registry에 등록한다.
- 이후: 같은 `CompanionPack` interface를 만족하는 pack을 registry에 추가한다.
- `SessionStore`, `WindowManager`, `InteractionController`, 우클릭 패널은 수정하지 않는다.
- string literal union에 pack ID를 계속 추가하지 않고 registry가 string ID를 검증한다.

외부 사용자가 설치하는 plugin은 이번 진화 경로와 별개다. 외부 code loading에는 서명, version compatibility, capability 제한, asset 검증, sandbox가 필요하므로 별도 제품 설계로 다룬다.

## 7. 오류 처리와 보안

- renderer는 Node.js API에 접근하지 않는다.
- preload는 snapshot 구독, window 이동, preferences처럼 필요한 channel만 공개한다.
- IPC payload의 theme ID, volume, 좌표, 크기를 runtime에서 검증한다.
- drag update는 frame 단위로 제한한다.
- 없는 pack은 `lava`로 fallback한다.
- audio 오류는 화면과 session 상태를 변경하지 않는다.
- 저장된 창 위치는 현재 display에 맞게 보정한다.
- prompt, response, tool input 본문을 저장하거나 renderer에 전달하지 않는다.
- session에는 표시용 project basename만 전달한다.
- 외부 plugin code를 로드하지 않는다.

## 8. 테스트 전략

테스트 surface는 각 module interface다.

자동 테스트:

- 5px 미만 click과 5px 이상 drag 판정
- drag 시작 후 click reaction과 sound 취소
- Provider별 다중 session 집계
- 활성 Provider만 표시
- `completed` 5초 유지 후 `idle` 전환
- 대표 상태 우선순위
- `CompanionRegistry` 조회와 `lava` fallback
- 상태별 interaction mapping
- mute, 30% 기본 volume, 120ms cooldown, 동시 재생 제한
- 초기 hydrate에서 상태 chime 미재생
- window bounds clamp와 180–480px 정사각형 제한
- preferences 항목별 복구
- 우클릭 패널 닫힘 조건

수동 Electron smoke test:

- object drag가 여러 display에서 자연스럽게 동작한다.
- native 가장자리 resize가 정사각형을 유지한다.
- 창 재실행 후 위치와 크기가 복구된다.
- 실제 macOS 출력에서 click sound와 UI chime 음량이 과하지 않다.
- reduced-motion 설정이 scene과 click reaction 모두에 적용된다.
- renderer에서 Node.js API에 접근할 수 없다.

## 9. 완료 기준

- object를 drag해 창을 이동할 수 있다.
- click과 drag가 5px threshold로 안정적으로 구분된다.
- 창은 180–480px 범위에서 정사각형으로 resize된다.
- 용암멍과 물멍이 우클릭 패널에서 즉시 전환된다.
- 모든 Agent 상태가 서로 다른 click reaction을 가진다.
- click에는 테마별 유기음, 중요 상태 변화에는 공통 UI chime이 재생된다.
- sound 기본값은 30% volume의 ON이며 mute와 volume이 저장된다.
- 우클릭 패널은 활성 Provider만 표시하고 다중 session을 집계·펼침 처리한다.
- 잘못된 설정, pack, audio, window bounds가 앱을 중단시키지 않는다.
- 자동 테스트, TypeScript typecheck, production build가 통과한다.
