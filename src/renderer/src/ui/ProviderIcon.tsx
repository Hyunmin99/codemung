import {
  CLAUDE_ICON_PATH,
  CODEX_ICON_PATH
} from '../../../shared/provider-icons'

export function ProviderIcon({
  provider
}: {
  provider: 'codex' | 'claude'
}): React.JSX.Element {
  return (
    <span
      className={`provider-icon provider-icon--${provider}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24">
        <path d={provider === 'codex' ? CODEX_ICON_PATH : CLAUDE_ICON_PATH} />
      </svg>
    </span>
  )
}
