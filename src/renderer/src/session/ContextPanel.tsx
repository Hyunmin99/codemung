import { useEffect, useId, useRef, useState } from 'react'
import type {
  AgentState,
  ProviderSummary,
  SessionSnapshot
} from '../../../shared/session'
import { ProviderIcon } from '../ui/ProviderIcon'

const STATE_LABELS = {
  idle: '쉬는 중',
  working: '작업 중',
  waiting_permission: '확인 필요',
  completed: '완료',
  error: '오류'
} as const

function StateLabel({ state }: { state: AgentState }): React.JSX.Element {
  return (
    <span className={`session-status session-status--${state}`}>
      <i aria-hidden="true" />
      {STATE_LABELS[state]}
    </span>
  )
}

function projectBasename(projectName: string): string {
  const normalized = projectName.replace(/\\/g, '/').replace(/\/+$/, '')
  return normalized.slice(normalized.lastIndexOf('/') + 1) || projectName
}

function ProviderRow({
  provider
}: {
  provider: ProviderSummary
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const providerName = provider.provider === 'claude' ? 'Claude' : 'Codex'
  return (
    <li className="context-provider">
      <button
        className="context-provider-toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-label={`${providerName} ${STATE_LABELS[provider.state]} ${provider.activeCount}개`}
        onClick={() => setExpanded((current) => !current)}
      >
        <ProviderIcon provider={provider.provider} />
        <span className="context-provider-copy">
          <strong>{providerName}</strong>
          <StateLabel state={provider.state} />
        </span>
        <span className="context-count">{provider.activeCount}</span>
        <span className="context-disclosure" aria-hidden="true">
          ›
        </span>
      </button>
      {expanded && (
        <ul
          id={listId}
          className="context-session-list"
          aria-label={`${providerName} 세션`}
        >
          {provider.sessions.map((session) => (
            <li key={session.sessionId} className="context-session-row">
              <span title={session.projectName}>
                {projectBasename(session.projectName)}
              </span>
              <StateLabel state={session.state} />
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

export function ContextPanel({
  snapshot,
  onClose
}: ContextPanelProps): React.JSX.Element {
  const panel = useRef<HTMLElement>(null)
  const headingId = useId()
  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])
  const count = snapshot.providers.reduce(
    (sum, provider) => sum + provider.activeCount,
    0
  )
  return (
    <aside
      ref={panel}
      tabIndex={-1}
      className="context-panel mac-surface"
      role="dialog"
      aria-modal="false"
      aria-label="활성 세션"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="context-panel-header">
        <h1 id={headingId}>
          활성 세션 <span>{count}</span>
        </h1>
        <button
          type="button"
          className="toolbar-button context-close"
          aria-label="세션 목록 닫기"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {snapshot.providers.length > 0 ? (
        <ul className="context-provider-list">
          {snapshot.providers.map((provider) => (
            <ProviderRow key={provider.provider} provider={provider} />
          ))}
        </ul>
      ) : (
        <div className="context-empty">
          <span className="empty-status" aria-hidden="true" />
          <p>현재 활성 작업 없음</p>
          <small>
            Claude나 Codex에서 작업을 시작하면
            <br />
            여기에서 상태를 확인할 수 있습니다.
          </small>
        </div>
      )}
      {count > 0 && (
        <footer className="context-panel-footer">
          세션 상태가 자동으로 업데이트됩니다.
        </footer>
      )}
    </aside>
  )
}
