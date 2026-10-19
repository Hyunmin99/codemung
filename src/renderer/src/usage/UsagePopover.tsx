import { useEffect, useState } from 'react'
import { ProviderIcon } from '../ui/ProviderIcon'

function remaining(value: UsageWindow): number {
  return Math.max(0, Math.min(100, 100 - value.usedPercent))
}

function resetLabel(resetsAt: number | null, now: number): string {
  if (!resetsAt) return '재설정 일정 없음'
  const minutes = Math.max(0, Math.ceil((resetsAt - now) / 60_000))
  if (minutes === 0) return '곧 재설정'
  if (minutes < 60) return `${minutes}분 후 재설정`
  if (minutes >= 1440)
    return `${Math.floor(minutes / 1440)}일 ${Math.floor((minutes % 1440) / 60)}시간 후 재설정`
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분 후 재설정`
}

function UsageBar({
  label,
  value,
  now
}: {
  label: string
  value: UsageWindow | null
  now: number
}): React.JSX.Element {
  const percent = value ? remaining(value) : null
  return (
    <div
      className={`usage-meter${percent !== null && percent <= 10 ? ' usage-meter--low' : ''}`}
    >
      <div className="usage-meter-heading">
        <span>{label}</span>
        <strong>
          {percent === null ? '정보 없음' : `${Math.round(percent)}%`}
          <small>{percent === null ? '' : ' 남음'}</small>
        </strong>
      </div>
      <div
        className="usage-track"
        role="progressbar"
        aria-label={`${label} 남은 사용량`}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(percent !== null
          ? { 'aria-valuenow': percent }
          : { 'aria-valuetext': '정보 없음' })}
      >
        <span style={{ width: `${percent ?? 0}%` }} />
      </div>
      <small>
        {percent === 0 ? '한도 소진 · ' : ''}
        {value ? resetLabel(value.resetsAt, now) : '연결 후 확인할 수 있습니다'}
      </small>
    </div>
  )
}

function statusLabel(provider: ProviderUsage | undefined): string {
  switch (provider?.status) {
    case 'ready':
      return '연결됨'
    case 'stale':
      return '갱신 지연'
    case 'error':
      return '연결 오류'
    case 'login-required':
      return '로그인 필요'
    case 'unavailable':
      return '연결 안 됨'
    default:
      return '확인 중'
  }
}

export function UsagePopover(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null)
  const [selectedBucket, setSelectedBucket] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [clock, setClock] = useState(Date.now())
  useEffect(() => {
    let active = true
    let receivedLive = false
    const off = window.codemung?.onUsageSnapshot((next) => {
      receivedLive = true
      setSnapshot(next)
    })
    void window.codemung
      ?.getUsageSnapshot()
      .then((next) => {
        if (active && !receivedLive && next) setSnapshot(next)
      })
      .catch(() => {
        if (active) setRefreshError('사용량을 불러오지 못했습니다.')
      })
    const timer = window.setInterval(() => setClock(Date.now()), 60_000)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') window.codemung?.closeUsage()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      active = false
      off?.()
      window.clearInterval(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  const bucket =
    snapshot?.codex.buckets.find((entry) => entry.id === selectedBucket) ??
    snapshot?.codex.buckets[0]
  useEffect(() => {
    if (bucket && bucket.id !== selectedBucket) {
      setSelectedBucket(bucket.id)
      window.codemung?.setUsageBucket(bucket.id)
    }
  }, [bucket?.id, selectedBucket])
  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const next = await window.codemung?.refreshUsage()
      if (next) setSnapshot(next)
    } catch (error) {
      setRefreshError(
        error instanceof Error ? error.message : '새로 고치지 못했습니다.'
      )
    } finally {
      setRefreshing(false)
    }
  }
  const openSettings = (): void => {
    window.codemung?.closeUsage()
    window.codemung?.openSettings()
  }
  const updatedAt = Math.max(
    snapshot?.codex.updatedAt ?? 0,
    snapshot?.claude.updatedAt ?? 0
  )
  return (
    <main
      className="usage-popover mac-surface"
      aria-label="CodeMung 남은 사용량"
    >
      <header className="usage-header">
        <h1>사용량</h1>
        <button
          className="toolbar-button refresh-button"
          onClick={() => void refresh()}
          disabled={refreshing}
          aria-label="새로 고침"
          aria-busy={refreshing}
          title="새로 고침"
        >
          <span aria-hidden="true">↻</span>
        </button>
      </header>
      <div className="usage-content" aria-busy={!snapshot}>
        {(['codex', 'claude'] as const).map((id) => {
          const provider = snapshot?.[id]
          const selected = id === 'codex' ? bucket : provider?.buckets[0]
          return (
            <section
              className="usage-provider"
              key={id}
              aria-label={`${id === 'codex' ? 'Codex' : 'Claude'} 사용량`}
            >
              <header className="provider-heading">
                <ProviderIcon provider={id} />
                <h2>{id === 'codex' ? 'Codex' : 'Claude'}</h2>
                <span
                  className={`connection-label${provider?.status === 'ready' ? ' connection-label--ready' : ''}`}
                >
                  <i aria-hidden="true" />
                  {statusLabel(provider)}
                </span>
              </header>
              {id === 'codex' && provider && provider.buckets.length > 1 && (
                <label className="bucket-select">
                  <span>한도 구분</span>
                  <select
                    value={bucket?.id ?? ''}
                    onChange={(event) => {
                      setSelectedBucket(event.target.value)
                      window.codemung?.setUsageBucket(event.target.value)
                    }}
                  >
                    {provider.buckets.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selected ? (
                <>
                  <UsageBar
                    label="5시간"
                    value={selected.fiveHour}
                    now={clock}
                  />
                  <UsageBar label="주간" value={selected.weekly} now={clock} />
                  {provider?.message && provider.status !== 'ready' && (
                    <p className="usage-message">{provider.message}</p>
                  )}
                </>
              ) : (
                <p className="usage-message usage-message--empty">
                  {provider?.message ??
                    (provider?.status === 'loading' || !provider
                      ? '사용량을 확인하고 있습니다…'
                      : '연결하면 남은 사용량을 확인할 수 있습니다.')}
                </p>
              )}
              {id === 'claude' &&
                provider &&
                ['login-required', 'unavailable', 'error'].includes(
                  provider.status
                ) && (
                  <button className="inline-button" onClick={openSettings}>
                    연결 설정…
                  </button>
                )}
            </section>
          )
        })}
      </div>
      {refreshError && (
        <p className="usage-error" role="alert">
          {refreshError}
        </p>
      )}
      <footer className="usage-footer">
        <span>
          {refreshing
            ? '새로 고치는 중…'
            : updatedAt
              ? `${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 업데이트`
              : '연결 상태 확인 중'}
        </span>
        <button className="inline-button" onClick={openSettings}>
          설정…
        </button>
      </footer>
    </main>
  )
}
