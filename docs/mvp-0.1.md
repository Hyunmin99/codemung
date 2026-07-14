# CodeMung MVP 0.1

## 제품 한 줄 정의

Claude와 Codex가 일하는 상태를 한눈에 보여주고, 기다리는 동안 함께 멍때리는 데스크톱 컴패니언.

## MVP 0.1 목표

- macOS에서 작은 always-on-top 창과 메뉴바 아이콘을 실행한다.
- Claude Code와 Codex의 작업 이벤트를 공통 모델로 변환한다.
- 두 Provider의 상태를 동시에 유지하고 대표 상태를 하나의 장면에 반영한다.
- `idle`, `working`, `waiting_permission`, `completed`, `error`를 최소한의 불멍 모션으로 구분한다.
- Provider 연결 실패가 Claude나 Codex의 작업 흐름을 막지 않게 한다.

## 비목표

- 사용량, 비용, 리셋 시각 조회
- 메뉴바 상세 팝오버와 세션 대시보드
- 물멍·숲멍 등 여러 테마와 고급 애니메이션
- 데이터베이스, 장기 히스토리, 재시작 후 세션 복구
- 자동 시작, 자동 업데이트, 배포 패키징
- Windows와 Linux 지원

## 첫 수직 슬라이스 범위

첫 결과물은 아래 흐름을 끝까지 연결한다.

```text
Claude/Codex hook
  → 로컬 hook bridge
  → Electron main process
  → 공통 session store
  → preload IPC
  → React 불멍 화면
```

구현은 단일 Electron 앱으로 시작한다. 모노레포, 별도 Core 패키지, Zustand, SQLite, Rive는 필요해질 때 도입한다.

최소 모듈은 다음과 같다.

- `main`: 앱·창·메뉴바 수명주기, 로컬 이벤트 수신
- `providers`: Claude/Codex 원본 이벤트 정규화
- `session-store`: 다중 세션 상태와 Provider별 대표 상태 계산
- `preload`: 현재 snapshot 조회와 변경 구독만 renderer에 노출
- `renderer`: 불멍 장면과 Claude/Codex 상태 배지
- `hook bridge`: 이벤트 전달 실패 시에도 빠르게 정상 종료
- `fixtures/tests`: 실제 hook 형태의 샘플과 reducer·normalizer 검증

## 공통 이벤트·상태 모델 초안

```ts
type Provider = "claude" | "codex";

type EventKind =
  | "session_started"
  | "activity"
  | "permission_requested"
  | "completed"
  | "failed"
  | "session_ended";

interface ProviderEvent {
  provider: Provider;
  sessionId: string;
  kind: EventKind;
  cwd?: string;
  occurredAt: number;
}

type AgentState =
  | "idle"
  | "working"
  | "waiting_permission"
  | "completed"
  | "error";
```

같은 Provider에 여러 세션이 있을 수 있으므로 세션별 상태를 유지한 뒤 Provider 상태를 집계한다. 화면 대표 상태의 우선순위는 다음과 같다.

```text
waiting_permission > error > completed > working > idle
```

`completed`는 3~5초만 보여준 뒤 `idle`로 돌아간다. 한 세션이 종료되어도 같은 Provider의 다른 활성 세션이 있으면 `idle`로 내리지 않는다.

## 보안·프라이버시 원칙

- 이벤트 수신 서버는 `127.0.0.1`의 임시 포트에만 연다.
- 포트와 난수 토큰은 사용자 전용 runtime 파일에 `0600` 권한으로 기록한다.
- 잘못된 토큰, 비정상 JSON, 크기 제한을 넘는 payload는 거부한다.
- renderer는 `contextIsolation: true`, `nodeIntegration: false`를 사용한다.
- preload에는 `getSnapshot`과 `onSnapshot`처럼 필요한 최소 API만 공개한다.
- 프롬프트, 응답, 도구 입력 본문은 저장하거나 화면에 전달하지 않는다.
- 프로젝트 표시는 전체 경로가 아닌 디렉터리 이름만 사용한다.
- 앱이 꺼졌거나 bridge 전송이 실패해도 hook은 짧은 시간 안에 성공 종료해 AI 작업을 방해하지 않는다.

## 완료 기준

- 개발 명령으로 메뉴바 아이콘과 작은 idle 불멍 창이 실행된다.
- fixture 입력으로 `working → waiting_permission → completed → idle` 변화를 500ms 안에 확인할 수 있다.
- Claude와 Codex 상태가 동시에 들어오면 각 배지는 독립 상태를 유지하고 장면은 우선순위가 높은 상태를 표시한다.
- 동일 Provider의 두 세션 중 하나가 종료되어도 다른 활성 세션 상태가 유지된다.
- 앱이 꺼진 상태에서 hook bridge가 300ms 안에 오류 없이 종료된다.
- 외부 인터페이스에서는 이벤트 서버에 접근할 수 없다.
- 잘못된 토큰과 과대·비정상 payload가 거부된다.
- 테스트, 타입 검사, production build가 모두 통과한다.
- renderer에서 Node.js API에 접근할 수 없다.

## 다음 슬라이스 순서

1. Electron + React 실행 뼈대, 메뉴바, idle 불멍 장면
2. 공통 session store와 fixture 기반 end-to-end 상태 변화
3. 토큰 기반 로컬 이벤트 서버와 공통 hook bridge
4. Claude/Codex normalizer와 실제 hook 수동 연결
5. hook 설정 설치 도구: dry-run, 기존 설정 병합, 백업, 제거 지원
6. 창 드래그·위치 저장과 완료 상태 타이머 다듬기
7. JSONL fallback과 앱 재시작 후 활성 세션 복구
8. MVP 0.2 사용량·리셋 시각 조회
