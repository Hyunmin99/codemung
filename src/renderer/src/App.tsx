import { MotionScene } from './motion/MotionScene'
import type { AgentState } from './motion/types'

type Agent = {
  id: 'claude' | 'codex'
  name: string
  state: AgentState
}

const STATE_LABELS: Record<AgentState, string> = {
  idle: '쉬는 중',
  working: '작업 중',
  waiting_permission: '확인 필요',
  completed: '완료',
  error: '오류'
}

const STATE_PRIORITY: Record<AgentState, number> = {
  idle: 0,
  working: 1,
  completed: 2,
  error: 3,
  waiting_permission: 4
}

const INITIAL_AGENTS: Agent[] = [
  { id: 'claude', name: 'Claude', state: 'idle' },
  { id: 'codex', name: 'Codex', state: 'working' }
]

function getRepresentativeState(agents: readonly Agent[]): AgentState {
  return agents.reduce<AgentState>(
    (current, agent) =>
      STATE_PRIORITY[agent.state] > STATE_PRIORITY[current] ? agent.state : current,
    'idle'
  )
}

function App(): React.JSX.Element {
  const representativeState = getRepresentativeState(INITIAL_AGENTS)

  return (
    <main className="companion" aria-label="코드멍 라바 모션">
      <MotionScene pack="lava" state={representativeState} />

      <p className="sr-only" aria-live="polite">
        현재 대표 상태: {STATE_LABELS[representativeState]}
      </p>
    </main>
  )
}

export default App
