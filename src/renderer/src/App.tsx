import { useEffect, useMemo, useState } from 'react'
import { MotionScene } from './motion/MotionScene'
import type { AgentState } from './motion/types'
import { CLAUDE_ICON_PATH, CODEX_ICON_PATH } from '../../shared/provider-icons'

function usageLabel(window: UsageWindow | null): string {
  if (!window) return '—'
  return `${Math.max(0, Math.min(100, Math.round(window.usedPercent)))}% 사용`
}

function resetLabel(resetsAt: number | null, now = Date.now()): string {
  if (!resetsAt) return '재설정 일정 없음'
  const minutes = Math.round((resetsAt - now) / 60000)
  if (minutes < 0) return '갱신 대기'
  if (minutes < 60) return `${minutes}분 후 재설정`
  if (minutes >= 24 * 60) {
    const days = Math.floor(minutes / (24 * 60))
    const hours = Math.floor((minutes % (24 * 60)) / 60)
    return `${days}일 ${hours}시간 후 재설정`
  }
  const hours = Math.floor(minutes / 60)
  return `${hours}시간 ${minutes % 60}분 후 재설정`
}

function UsageBar({ label, value, reset, exhausted }: { label: string; value: UsageWindow | null; reset: string; exhausted?: boolean }): React.JSX.Element {
  const used = value ? Math.max(0, Math.min(100, value.usedPercent)) : 0
  return <div className="usage-meter">
    <div className="usage-meter-heading"><span>{label}</span><strong className={exhausted ? 'usage-exhausted' : ''}>{usageLabel(value)}</strong></div>
    <div className="usage-track" role="progressbar" aria-label={`${label} 사용량`} aria-valuemin={0} aria-valuemax={100} {...(value ? { 'aria-valuenow': used } : {})}><span style={{ width: `${used}%` }} /></div>
    <small>{exhausted ? '한도 소진' : reset}</small>
  </div>
}

function ProviderIcon({ provider }: { provider: 'codex' | 'claude' }): React.JSX.Element {
  const iconPath = provider === 'codex' ? CODEX_ICON_PATH : CLAUDE_ICON_PATH
  return <span className={`provider-icon provider-icon-${provider}`} aria-hidden="true"><svg viewBox="0 0 24 24"><path d={iconPath} /></svg></span>
}
function UsagePopover(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null)
  const [selectedBucket, setSelectedBucket] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [clock, setClock] = useState(Date.now())
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  useEffect(() => window.codemung?.onUsageSnapshot((next) => setSnapshot(next)), [])
  useEffect(() => { void window.codemung?.getUsageSnapshot().then((current) => { if (current) setSnapshot(current) }); const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') window.codemung?.closeUsage() }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [])
  const codex = snapshot?.codex
  const claude = snapshot?.claude
  const bucket = codex?.buckets.find((entry) => entry.id === selectedBucket) ?? codex?.buckets[0]
  useEffect(() => { if (bucket && bucket.id !== selectedBucket) { setSelectedBucket(bucket.id); window.codemung?.setUsageBucket(bucket.id) } }, [bucket?.id, selectedBucket])
  const refresh = async () => { setRefreshing(true); setRefreshError(null); try { const next = await window.codemung?.refreshUsage(); if (next) setSnapshot(next) } catch (error) { setRefreshError(error instanceof Error ? error.message : '새로 고치지 못했습니다.') } finally { setRefreshing(false) } }
  return <main className="usage-popover" aria-label="CodeMung 사용량">
    <header className="usage-header"><div><span className="eyebrow">CODEMUNG</span><h1>사용량</h1></div><button className="icon-button" onClick={() => void refresh()} disabled={refreshing} aria-label="새로 고침">↻</button></header>
    <section className="provider-card"><div className="provider-heading"><ProviderIcon provider="codex" /><div><h2>Codex</h2><span>{codex?.status === 'stale' ? '갱신 지연' : codex?.status === 'ready' ? '정상 연결됨' : codex?.message ?? '불러오는 중'}</span></div></div>
      {codex && codex.buckets.length > 1 && <label className="bucket-select"><span>사용량 구분</span><select value={bucket?.id ?? ''} onChange={(event) => { setSelectedBucket(event.target.value); window.codemung?.setUsageBucket(event.target.value) }}>{codex.buckets.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>}
      <UsageBar label="5시간" value={bucket?.fiveHour ?? null} reset={resetLabel(bucket?.fiveHour?.resetsAt ?? null, clock)} />
      <UsageBar label="주간" value={bucket?.weekly ?? null} exhausted={bucket?.weekly?.usedPercent === 100} reset={resetLabel(bucket?.weekly?.resetsAt ?? null, clock)} />
      <small className="provider-updated">{codex?.updatedAt ? `업데이트 ${new Date(codex.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '업데이트 확인 중'}</small>
    </section>
    <section className="provider-card"><div className="provider-heading"><ProviderIcon provider="claude" /><div><h2>Claude</h2><span>{claude?.status === 'stale' ? '갱신 지연' : claude?.status === 'ready' ? '정상 연결됨' : claude?.message ?? '연결 필요'}</span></div></div>
      <UsageBar label="5시간" value={claude?.buckets[0]?.fiveHour ?? null} reset={resetLabel(claude?.buckets[0]?.fiveHour?.resetsAt ?? null, clock)} />
      <UsageBar label="주간" value={claude?.buckets[0]?.weekly ?? null} exhausted={claude?.buckets[0]?.weekly?.usedPercent === 100} reset={resetLabel(claude?.buckets[0]?.weekly?.resetsAt ?? null, clock)} />
      <small className="provider-updated">{claude?.updatedAt ? `업데이트 ${new Date(claude.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '업데이트 확인 중'}</small>
    </section>
    <footer className="usage-footer"><span>{refreshError ?? ''}</span><div><button onClick={() => void window.codemung?.connectClaude()}>Claude 연결</button><button onClick={() => void refresh()} disabled={refreshing}>{refreshing ? '갱신 중…' : '새로 고침'}</button><button onClick={() => window.codemung?.openSettings()}>설정</button><button onClick={() => window.codemung?.toggleCompanion()}>동반자</button><button onClick={() => window.codemung?.quit()}>종료</button></div></footer>
  </main>
}

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
          <MotionScene pack="lava" state={representativeState} reduceMotion={settings.reduceMotion} />
        </div>
        <div>
          <strong>{agents.length === 0 ? '표시할 에이전트 없음' : `${agents.length}개 에이전트 표시`}</strong>
          <p>현재 상태: {STATE_LABELS[representativeState]}</p>
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
              <small>Codex 상태를 화면에 반영합니다</small>
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
  if (window.location.hash === '#usage') return <UsagePopover />
  const isSettingsWindow = window.location.hash === '#settings'
  const [settings, setSettings] = useState(readStoredSettings)
  const [appInfo, setAppInfo] = useState<CodeMungAppInfo | null>(null)
  const agents = useMemo(
    () => INITIAL_AGENTS
      .map((agent) => agent.id === 'codex' ? { ...agent, state: settings.previewState } : agent)
      .filter((agent) => settings.visibleAgents[agent.id]),
    [settings.previewState, settings.visibleAgents]
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
