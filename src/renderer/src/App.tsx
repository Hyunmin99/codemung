import { useEffect, useMemo, useState } from 'react'
import { MotionScene } from './motion/MotionScene'
import type { AgentState } from './motion/types'
import { useSessionSnapshot } from './useSessionSnapshot'

type Agent = {
  id: 'claude' | 'codex'
  name: string
  state: AgentState
}

type AgentVisibility = Record<Agent['id'], boolean>

type CompanionSettings = {
  alwaysOnTop: boolean
  reduceMotion: boolean
  previewState: AgentState
  visibleAgents: AgentVisibility
}

type SettingKey = keyof CompanionSettings

const SETTINGS_STORAGE_KEY = 'codemung:companion-settings'
const AGENT_STATES: readonly AgentState[] = [
  'idle',
  'working',
  'waiting_permission',
  'completed',
  'error'
]
const STATE_LABELS: Record<AgentState, string> = {
  idle: '쉬는 중',
  working: '작업 중',
  waiting_permission: '확인 필요',
  completed: '완료',
  error: '오류'
}
// Duplicated from src/main/session-store.ts and the two copies must stay in sync.
// snapshot.representativeState cannot be used directly because hidden agents must not drive
// the scene, and the store has no access to the renderer-side visibility settings.
const STATE_PRIORITY: Record<AgentState, number> = {
  idle: 0,
  working: 1,
  completed: 2,
  error: 3,
  waiting_permission: 4
}
const AGENT_DEFINITIONS: readonly { id: Agent['id']; name: string }[] = [
  { id: 'claude', name: 'Claude' },
  { id: 'codex', name: 'Codex' }
]
const DEFAULT_SETTINGS: CompanionSettings = {
  alwaysOnTop: true,
  reduceMotion: false,
  previewState: 'working',
  visibleAgents: { claude: true, codex: true }
}

function isAgentState(value: unknown): value is AgentState {
  return typeof value === 'string' && AGENT_STATES.includes(value as AgentState)
}

function parseSettings(rawSettings: string | null): CompanionSettings {
  if (!rawSettings) return DEFAULT_SETTINGS

  try {
    const parsed = JSON.parse(rawSettings) as Partial<CompanionSettings>
    return {
      alwaysOnTop:
        typeof parsed.alwaysOnTop === 'boolean'
          ? parsed.alwaysOnTop
          : DEFAULT_SETTINGS.alwaysOnTop,
      reduceMotion:
        typeof parsed.reduceMotion === 'boolean'
          ? parsed.reduceMotion
          : DEFAULT_SETTINGS.reduceMotion,
      previewState: isAgentState(parsed.previewState)
        ? parsed.previewState
        : DEFAULT_SETTINGS.previewState,
      visibleAgents: {
        claude:
          typeof parsed.visibleAgents?.claude === 'boolean'
            ? parsed.visibleAgents.claude
            : DEFAULT_SETTINGS.visibleAgents.claude,
        codex:
          typeof parsed.visibleAgents?.codex === 'boolean'
            ? parsed.visibleAgents.codex
            : DEFAULT_SETTINGS.visibleAgents.codex
      }
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function readStoredSettings(): CompanionSettings {
  return typeof window === 'undefined'
    ? DEFAULT_SETTINGS
    : parseSettings(window.localStorage.getItem(SETTINGS_STORAGE_KEY))
}

function getRepresentativeState(agents: readonly Agent[]): AgentState {
  return agents.reduce<AgentState>(
    (current, agent) =>
      STATE_PRIORITY[agent.state] > STATE_PRIORITY[current] ? agent.state : current,
    'idle'
  )
}

interface SettingsScreenProps {
  agents: readonly Agent[]
  appInfo: CodeMungAppInfo | null
  representativeState: AgentState
  settings: CompanionSettings
  onReset: () => void
  onSettingChange: <Key extends SettingKey>(key: Key, value: CompanionSettings[Key]) => void
  onVisibleAgentChange: (agentId: Agent['id'], visible: boolean) => void
}

function SettingsScreen({
  agents,
  appInfo,
  representativeState,
  settings,
  onReset,
  onSettingChange,
  onVisibleAgentChange
}: SettingsScreenProps): React.JSX.Element {
  return (
    <main className="settings-window" aria-label="CodeMung 설정">
      <header className="settings-titlebar">
        <h1>CodeMung 설정</h1>
        <p>{appInfo ? `버전 ${appInfo.version}` : 'Companion 환경설정'}</p>
      </header>

      <section className="settings-preview-row" aria-label="Companion 미리보기">
        <div className="settings-preview" aria-hidden="true">
          <MotionScene pack="lava" state={settings.previewState} reduceMotion={settings.reduceMotion} />
        </div>
        <div>
          <strong>{agents.length === 0 ? '표시할 에이전트 없음' : `${agents.length}개 에이전트 표시`}</strong>
          <p>companion 상태: {STATE_LABELS[representativeState]}</p>
          <p>미리보기 상태: {STATE_LABELS[settings.previewState]}</p>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="agents-heading">
        <h2 id="agents-heading">에이전트</h2>
        <div className="settings-group-content">
          <label className="setting-row">
            <span>Claude</span>
            <input
              type="checkbox"
              checked={settings.visibleAgents.claude}
              onChange={(event) => onVisibleAgentChange('claude', event.currentTarget.checked)}
            />
          </label>
          <label className="setting-row">
            <span>Codex</span>
            <input
              type="checkbox"
              checked={settings.visibleAgents.codex}
              onChange={(event) => onVisibleAgentChange('codex', event.currentTarget.checked)}
            />
          </label>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="motion-heading">
        <h2 id="motion-heading">모션</h2>
        <div className="settings-group-content">
          <label className="setting-row">
            <span>
              <strong>상태 미리보기</strong>
              <small>이 설정 창의 미리보기에만 적용됩니다</small>
            </span>
            <select
              value={settings.previewState}
              onChange={(event) => onSettingChange('previewState', event.currentTarget.value as AgentState)}
            >
              {AGENT_STATES.map((state) => (
                <option key={state} value={state}>{STATE_LABELS[state]}</option>
              ))}
            </select>
          </label>
          <label className="setting-row">
            <span>
              <strong>저자극 모션</strong>
              <small>애니메이션의 속도와 흔들림을 줄입니다</small>
            </span>
            <input
              type="checkbox"
              checked={settings.reduceMotion}
              onChange={(event) => onSettingChange('reduceMotion', event.currentTarget.checked)}
            />
          </label>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="window-heading">
        <h2 id="window-heading">창</h2>
        <div className="settings-group-content">
          <label className="setting-row">
            <span>
              <strong>항상 위</strong>
              <small>다른 창 위에 companion을 표시합니다</small>
            </span>
            <input
              type="checkbox"
              checked={settings.alwaysOnTop}
              onChange={(event) => onSettingChange('alwaysOnTop', event.currentTarget.checked)}
            />
          </label>
        </div>
      </section>

      <div className="settings-reset">
        <button type="button" onClick={onReset}>기본값으로 복원</button>
      </div>
    </main>
  )
}

function App(): React.JSX.Element {
  const isSettingsWindow = window.location.hash === '#settings'
  const [settings, setSettings] = useState(readStoredSettings)
  const [appInfo, setAppInfo] = useState<CodeMungAppInfo | null>(null)
  const snapshot = useSessionSnapshot()
  // Hidden agents must not drive the scene, so the priority is recomputed over the visible ones.
  const agents = useMemo<Agent[]>(
    () =>
      AGENT_DEFINITIONS
        .filter((agent) => settings.visibleAgents[agent.id])
        .map((agent) => ({ ...agent, state: snapshot?.providers[agent.id].state ?? 'idle' })),
    [snapshot, settings.visibleAgents]
  )
  const representativeState = getRepresentativeState(agents)

  useEffect(() => {
    if (isSettingsWindow) void window.codemung?.getAppInfo().then(setAppInfo)
  }, [isSettingsWindow])

  useEffect(() => {
    const handleStorage = (event: StorageEvent): void => {
      if (event.key === SETTINGS_STORAGE_KEY) setSettings(parseSettings(event.newValue))
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    void window.codemung?.setAlwaysOnTop(settings.alwaysOnTop)
  }, [settings.alwaysOnTop])

  function updateSetting<Key extends SettingKey>(key: Key, value: CompanionSettings[Key]): void {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  function updateVisibleAgent(agentId: Agent['id'], visible: boolean): void {
    setSettings((current) => ({
      ...current,
      visibleAgents: { ...current.visibleAgents, [agentId]: visible }
    }))
  }

  if (isSettingsWindow) {
    return <SettingsScreen agents={agents} appInfo={appInfo} representativeState={representativeState} settings={settings} onReset={() => setSettings(DEFAULT_SETTINGS)} onSettingChange={updateSetting} onVisibleAgentChange={updateVisibleAgent} />
  }

  return (
    <main className="companion" aria-label="코드멍 라바 모션">
      <MotionScene pack="lava" state={representativeState} reduceMotion={settings.reduceMotion} />
      <p className="sr-only" aria-live="polite">현재 대표 상태: {STATE_LABELS[representativeState]}</p>
    </main>
  )
}

export default App
