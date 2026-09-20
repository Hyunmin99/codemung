import { useEffect, useState } from 'react'
import type { ProviderSummary, SessionSnapshot } from '../../../shared/session'

const STATE_LABELS = {
  idle: '쉬는 중',
  working: '작업 중',
  waiting_permission: '확인 필요',
  completed: '완료',
  error: '오류'
} as const

function projectBasename(projectName: string): string {
  const normalized = projectName.replace(/\\/g, '/').replace(/\/+$/, '')
  return normalized.slice(normalized.lastIndexOf('/') + 1) || projectName
}

function ProviderRow({ provider }: { provider: ProviderSummary }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const providerName = provider.provider === 'claude' ? 'Claude' : 'Codex'
  const countLabel = `${provider.activeCount}개`

  return (
    <li className="context-provider">
      <button
        className="context-provider-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className={`context-provider-mark context-provider-mark--${provider.provider}`} aria-hidden="true" />
        <span className="context-provider-copy"><strong>{providerName}</strong><small>{STATE_LABELS[provider.state]} · {countLabel}</small></span>
        <span className="context-disclosure" aria-hidden="true">⌄</span>
      </button>
      {expanded && (
        <ul className="context-session-list" aria-label={`${providerName} 세션`}>
          {provider.sessions.map((session) => (
            <li key={session.sessionId} className="context-session-row">
              <span>{projectBasename(session.projectName)}</span>
              <small>{STATE_LABELS[session.state]}</small>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

interface ContextPanelProps {
  snapshot: SessionSnapshot
  onClose: () => void
}

export function ContextPanel({ snapshot, onClose }: ContextPanelProps): React.JSX.Element {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <aside
      className="context-panel"
      role="dialog"
      aria-modal="false"
      aria-label="활성 세션"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="context-panel-header">
        <div><span>CODEMUNG</span><h1>활성 세션</h1></div>
        <button type="button" className="context-close" aria-label="세션 목록 닫기" onClick={onClose}>×</button>
      </header>
      {snapshot.providers.length > 0 ? (
        <ul className="context-provider-list">
          {snapshot.providers.map((provider) => <ProviderRow key={provider.provider} provider={provider} />)}
        </ul>
      ) : <p className="context-empty">현재 활성 작업 없음</p>}
    </aside>
  )
}
