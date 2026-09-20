import { useEffect, useMemo, useState } from 'react'
import { CompanionSurface } from './companion/CompanionSurface'
import { createSessionStore } from './session/session-store'
import { CLAUDE_ICON_PATH, CODEX_ICON_PATH } from '../../shared/provider-icons'
import { DEFAULT_OBJECT_ID } from '../../shared/object'
import { registeredMotionPacks } from './motion/registry'
import { MotionScene } from './motion/MotionScene'

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
    <footer className="usage-footer"><span>{refreshError ?? ''}</span><div><button onClick={() => void window.codemung?.connectClaude()}>Claude 연결</button><button onClick={() => window.codemung?.openSettings()}>설정</button><button onClick={() => window.codemung?.toggleCompanion()}>오브제 창</button><button onClick={() => window.codemung?.quit()}>종료</button></div></footer>
  </main>
}

interface SettingsScreenProps {
  appInfo: CodeMungAppInfo | null
}

const OBJECT_SIZE_OPTIONS: Array<{ value: ObjectSize; label: string }> = [
  { value: 'small', label: '작게' },
  { value: 'medium', label: '보통' },
  { value: 'large', label: '크게' }
]

function getObjectSizeApi(): (() => Promise<ObjectSize | undefined>) | undefined {
  // Prefer the compatibility channel so a hot-reloaded preload can still talk
  // to a main process from the previous build.
  return window.codemung?.getCharacterSize ?? window.codemung?.getObjectSize
}

function subscribeObjectSize(listener: (size: ObjectSize) => void): (() => void) | undefined {
  return (window.codemung?.onCharacterSize ?? window.codemung?.onObjectSize)?.(listener)
}

function updateObjectSize(size: ObjectSize): void {
  const setter = window.codemung?.setCharacterSize ?? window.codemung?.setObjectSize
  setter?.(size)
}

function subscribeObjectId(listener: (id: ObjectId) => void): (() => void) | undefined {
  return window.codemung?.onObjectId?.(listener)
}

function SettingsScreen({
  appInfo
}: SettingsScreenProps): React.JSX.Element {
  const [objectSize, setObjectSize] = useState<ObjectSize>('medium')
  const [objectId, setObjectId] = useState<ObjectId>(DEFAULT_OBJECT_ID)
  useEffect(() => {
    void getObjectSizeApi()?.().then((size) => { if (size) setObjectSize(size) })
    const offSize = subscribeObjectSize(setObjectSize)
    const offObject = subscribeObjectId(setObjectId)
    void window.codemung?.getObjectId?.().then((id) => { if (id) setObjectId(id) })
    return () => { offSize?.(); offObject?.() }
  }, [])
  return (
    <main className="settings-window" aria-label="CodeMung 설정">
      <header className="settings-titlebar">
        <h1>CodeMung 설정</h1>
        <p>{appInfo ? `버전 ${appInfo.version}` : 'CodeMung 환경설정'}</p>
      </header>

      <section className="settings-group" aria-labelledby="object-size-heading">
        <h2 id="object-size-heading">오브제</h2>
        <div className="settings-group-content">
          <div className="object-picker" role="radiogroup" aria-label="오브제 종류">
            {registeredMotionPacks.map((option) => <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={objectId === option.id}
              className="object-option"
              onClick={() => { setObjectId(option.id); window.codemung?.setObjectId?.(option.id) }}
            >
              <span className="object-option-preview" aria-hidden="true"><MotionScene pack={option.id} state="idle" size="small" /></span>
              <span className="object-option-copy"><strong>{option.label}</strong><small>{option.description}</small></span>
              <span className="object-option-check" aria-hidden="true">{objectId === option.id ? '✓' : ''}</span>
            </button>)}
          </div>
          <div className="setting-row settings-size-row">
            <span><strong>오브제 크기</strong><small>라바와 클릭 영역을 함께 조절합니다</small></span>
            <div className="settings-segmented" role="radiogroup" aria-label="오브제 크기">
              {OBJECT_SIZE_OPTIONS.map((option) => <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={objectSize === option.value}
                className="settings-segment"
                onClick={() => { setObjectSize(option.value); updateObjectSize(option.value) }}
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
  // Real provider events are not connected yet. Start empty so preview fixtures
  // can never be mistaken for live Claude or Codex activity.
  const sessionStore = useMemo(() => createSessionStore([]), [])
  const [objectSize, setObjectSize] = useState<ObjectSize>('medium')
  const [objectId, setObjectId] = useState<ObjectId>(DEFAULT_OBJECT_ID)

  useEffect(() => {
    if (isSettingsWindow) void window.codemung?.getAppInfo().then(setAppInfo)
  }, [isSettingsWindow])

  useEffect(() => {
    const unsubscribe = subscribeObjectSize(setObjectSize)
    void getObjectSizeApi()?.().then((size) => { if (size) setObjectSize(size) })
    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeObjectId(setObjectId)
    void window.codemung?.getObjectId?.().then((id) => { if (id) setObjectId(id) })
    return unsubscribe
  }, [])

  if (isSettingsWindow) {
    return <SettingsScreen appInfo={appInfo} />
  }

  return (
    <CompanionSurface
      store={sessionStore}
      size={objectSize}
      objectId={objectId}
      onPanelOpenChange={(isOpen) => window.codemung?.setSessionPanelOpen(isOpen)}
      onDragStart={({ startScreenX, startScreenY }) => window.codemung?.startCompanionDrag(startScreenX, startScreenY)}
      onDrag={({ screenX, screenY }) => window.codemung?.moveCompanion(screenX, screenY)}
      onDragEnd={() => window.codemung?.endCompanionDrag()}
    />
  )
}

export default App
