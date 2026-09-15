import { useEffect, useMemo, useState } from 'react'
import { MotionScene } from './motion/MotionScene'
import type { AgentState } from './motion/types'
import { CLAUDE_ICON_PATH, CODEX_ICON_PATH } from '../../shared/provider-icons'

function usageLabel(window: UsageWindow | null): string {
  if (!window) return '—'
  const remaining = Math.max(0, Math.min(100, 100 - window.usedPercent))
  return `${Math.round(remaining)}% 남음`
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
  const remaining = value ? Math.max(0, Math.min(100, 100 - value.usedPercent)) : 0
  return <div className="usage-meter">
    <div className="usage-meter-heading"><span>{label}</span><strong className={exhausted ? 'usage-exhausted' : ''}>{usageLabel(value)}</strong></div>
    <div className="usage-track" role="progressbar" aria-label={`${label} 남은 사용량`} aria-valuemin={0} aria-valuemax={100} {...(value ? { 'aria-valuenow': remaining } : {})}><span style={{ width: `${remaining}%` }} /></div>
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
  return <main className="usage-popover" aria-label="CodeMung 남은 사용량">
    <header className="usage-header"><div><span className="eyebrow">CODEMUNG</span><h1>남은 사용량</h1></div><button className="icon-button" onClick={() => void refresh()} disabled={refreshing} aria-label="새로 고침">↻</button></header>
    <section className="provider-card"><div className="provider-heading"><ProviderIcon provider="codex" /><div><h2>Codex</h2><span>{codex?.status === 'stale' ? '갱신 지연' : codex?.status === 'ready' ? '정상 연결됨' : codex?.message ?? '불러오는 중'}</span></div></div>
      {codex && codex.buckets.length > 1 && <label className="bucket-select"><span>남은 사용량 구분</span><select value={bucket?.id ?? ''} onChange={(event) => { setSelectedBucket(event.target.value); window.codemung?.setUsageBucket(event.target.value) }}>{codex.buckets.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>}
      <UsageBar label="5시간" value={bucket?.fiveHour ?? null} reset={resetLabel(bucket?.fiveHour?.resetsAt ?? null, clock)} />
      <UsageBar label="주간" value={bucket?.weekly ?? null} exhausted={bucket?.weekly?.usedPercent === 100} reset={resetLabel(bucket?.weekly?.resetsAt ?? null, clock)} />
      <small className="provider-updated">{codex?.updatedAt ? `업데이트 ${new Date(codex.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '업데이트 확인 중'}</small>
    </section>
    <section className="provider-card"><div className="provider-heading"><ProviderIcon provider="claude" /><div><h2>Claude</h2><span>{claude?.status === 'stale' ? '갱신 지연' : claude?.status === 'ready' ? '정상 연결됨' : claude?.message ?? '연결 필요'}</span></div></div>
      <UsageBar label="5시간" value={claude?.buckets[0]?.fiveHour ?? null} reset={resetLabel(claude?.buckets[0]?.fiveHour?.resetsAt ?? null, clock)} />
      <UsageBar label="주간" value={claude?.buckets[0]?.weekly ?? null} exhausted={claude?.buckets[0]?.weekly?.usedPercent === 100} reset={resetLabel(claude?.buckets[0]?.weekly?.resetsAt ?? null, clock)} />
      <small className="provider-updated">{claude?.updatedAt ? `업데이트 ${new Date(claude.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '업데이트 확인 중'}</small>
    </section>
    <footer className="usage-footer"><span>{refreshError ?? ''}</span><div><button onClick={() => void window.codemung?.connectClaude()}>Claude 연결</button><button onClick={() => window.codemung?.openSettings()}>설정</button><button onClick={() => window.codemung?.toggleCompanion()}>캐릭터 창</button><button onClick={() => window.codemung?.quit()}>종료</button></div></footer>
  </main>
}

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

interface SettingsScreenProps {
  appInfo: CodeMungAppInfo | null
}

const CHARACTER_SIZE_OPTIONS: Array<{ value: CharacterSize; label: string }> = [
  { value: 'small', label: '작게' },
  { value: 'medium', label: '보통' },
  { value: 'large', label: '크게' }
]

function SettingsScreen({
  appInfo
}: SettingsScreenProps): React.JSX.Element {
  const [characterSize, setCharacterSize] = useState<CharacterSize>('medium')
  useEffect(() => {
    void window.codemung?.getCharacterSize().then((size) => { if (size) setCharacterSize(size) })
    return window.codemung?.onCharacterSize((size) => setCharacterSize(size))
  }, [])
  return (
    <main className="settings-window" aria-label="CodeMung 설정">
      <header className="settings-titlebar">
        <h1>CodeMung 설정</h1>
        <p>{appInfo ? `버전 ${appInfo.version}` : 'CodeMung 환경설정'}</p>
      </header>

      <section className="settings-group" aria-labelledby="character-size-heading">
        <h2 id="character-size-heading">캐릭터</h2>
        <div className="settings-group-content">
          <div className="setting-row settings-size-row">
            <span><strong>캐릭터 크기</strong><small>라바와 클릭 영역을 함께 조절합니다</small></span>
            <div className="settings-segmented" role="radiogroup" aria-label="캐릭터 크기">
              {CHARACTER_SIZE_OPTIONS.map((option) => <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={characterSize === option.value}
                className="settings-segment"
                onClick={() => { setCharacterSize(option.value); window.codemung?.setCharacterSize(option.value) }}
              >{option.label}</button>)}
            </div>
          </div>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="updates-heading">
        <h2 id="updates-heading">업데이트</h2>
        <div className="settings-group-content">
          <div className="setting-row settings-update-row">
            <span>
              <strong>CodeMung 업데이트</strong>
              <small>최신 릴리스 확인</small>
            </span>
            <button type="button" className="settings-update-button" onClick={() => void window.codemung?.openReleases()}>
              확인
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

function App(): React.JSX.Element {
  if (window.location.hash === '#usage') return <UsagePopover />
  const isSettingsWindow = window.location.hash === '#settings'
  const [appInfo, setAppInfo] = useState<CodeMungAppInfo | null>(null)
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null)
  const agents = useMemo(
    () => snapshot
      ? INITIAL_AGENTS.filter((agent) => ['ready', 'stale'].includes(snapshot[agent.id].status))
      : [],
    [snapshot]
  )
  const representativeState = getRepresentativeState(agents)
  const [characterSize, setCharacterSize] = useState<CharacterSize>('medium')

  useEffect(() => {
    if (isSettingsWindow) void window.codemung?.getAppInfo().then(setAppInfo)
  }, [isSettingsWindow])

  useEffect(() => {
    const unsubscribe = window.codemung?.onUsageSnapshot((next) => setSnapshot(next))
    void window.codemung?.getUsageSnapshot().then((current) => { if (current) setSnapshot(current) })
    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = window.codemung?.onCharacterSize((size) => setCharacterSize(size))
    void window.codemung?.getCharacterSize().then((size) => { if (size) setCharacterSize(size) })
    return unsubscribe
  }, [])

  if (isSettingsWindow) {
    return <SettingsScreen appInfo={appInfo} />
  }

  return (
    <main className="companion" aria-label="코드멍 라바 모션">
      <MotionScene pack="lava" state={representativeState} size={characterSize} />
      <p className="sr-only" aria-live="polite">현재 대표 상태: {STATE_LABELS[representativeState]}</p>
    </main>
  )
}

export default App
