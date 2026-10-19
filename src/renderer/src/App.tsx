import { useEffect, useMemo, useState } from 'react'
import { CompanionSurface } from './companion/CompanionSurface'
import { createSessionStore } from './session/session-store'
import { UsagePopover } from './usage/UsagePopover'
import { DEFAULT_OBJECT_ID } from '../../shared/object'
import { registeredMotionPacks } from './motion/registry'
import { MotionScene } from './motion/MotionScene'

import {
  createSessionSoundObserver,
  getSoundPreference,
  playSound,
  saveSoundPreference,
  SOUND_KEY
} from './audio/sound'

interface SettingsScreenProps {
  appInfo: CodeMungAppInfo | null
}

const OBJECT_SIZE_OPTIONS: Array<{ value: ObjectSize; label: string }> = [
  { value: 'small', label: '작게' },
  { value: 'medium', label: '보통' },
  { value: 'large', label: '크게' }
]

function getObjectSizeApi():
  (() => Promise<ObjectSize | undefined>) | undefined {
  // Prefer the compatibility channel so a hot-reloaded preload can still talk
  // to a main process from the previous build.
  return window.codemung?.getCharacterSize ?? window.codemung?.getObjectSize
}

function subscribeObjectSize(
  listener: (size: ObjectSize) => void
): (() => void) | undefined {
  return (window.codemung?.onCharacterSize ?? window.codemung?.onObjectSize)?.(
    listener
  )
}

function updateObjectSize(size: ObjectSize): void {
  const setter =
    window.codemung?.setCharacterSize ?? window.codemung?.setObjectSize
  setter?.(size)
}

function subscribeObjectId(
  listener: (id: ObjectId) => void
): (() => void) | undefined {
  return window.codemung?.onObjectId?.(listener)
}

const SETTINGS_PANES = [
  { id: 'general', label: '일반' },
  { id: 'sound', label: '소리' },
  { id: 'connection', label: '연결' },
  { id: 'about', label: '정보' }
] as const

type SettingsPane = (typeof SETTINGS_PANES)[number]['id']
const SETTINGS_PANE_KEY = 'codemung:settings-pane'

function savedSettingsPane(): SettingsPane {
  try {
    const saved = window.localStorage.getItem(SETTINGS_PANE_KEY)
    return SETTINGS_PANES.find((pane) => pane.id === saved)?.id ?? 'general'
  } catch {
    return 'general'
  }
}

function SettingsScreen({ appInfo }: SettingsScreenProps): React.JSX.Element {
  const [pane, setPane] = useState(savedSettingsPane)
  const paneLabel = SETTINGS_PANES.find((item) => item.id === pane)!.label
  useEffect(() => {
    document.title = `${paneLabel} — CodeMung 설정`
    try {
      window.localStorage.setItem(SETTINGS_PANE_KEY, pane)
    } catch {
      /* Session-only navigation when storage is unavailable. */
    }
  }, [pane, paneLabel])
  const [sound, setSound] = useState(getSoundPreference)
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === SOUND_KEY || event.key === null)
        setSound(getSoundPreference())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  const [objectSize, setObjectSize] = useState<ObjectSize>('medium')
  const [objectId, setObjectId] = useState<ObjectId>(DEFAULT_OBJECT_ID)
  const [claudeStatus, setClaudeStatus] =
    useState<
      Awaited<
        ReturnType<
          NonNullable<typeof window.codemung>['getClaudeConnectionStatus']
        >
      >
    >()
  const [claudeMessage, setClaudeMessage] = useState('')
  const [claudeBusy, setClaudeBusy] = useState(false)
  const refreshClaudeStatus = () =>
    void window.codemung?.getClaudeConnectionStatus().then(setClaudeStatus)
  useEffect(() => {
    void getObjectSizeApi()?.().then((size) => {
      if (size) setObjectSize(size)
    })
    const offSize = subscribeObjectSize(setObjectSize)
    const offObject = subscribeObjectId(setObjectId)
    void window.codemung?.getObjectId?.().then((id) => {
      if (id) setObjectId(id)
    })
    refreshClaudeStatus()
    const timer = window.setInterval(refreshClaudeStatus, 2_000)
    return () => {
      offSize?.()
      offObject?.()
      window.clearInterval(timer)
    }
  }, [])
  const changeConnection = async (disconnect = false): Promise<void> => {
    setClaudeBusy(true)
    setClaudeMessage('')
    try {
      const result = disconnect
        ? await window.codemung?.disconnectClaude()
        : await window.codemung?.connectClaude()
      const succeeded =
        result &&
        ('ok' in result
          ? result.ok
          : ['installed', 'already-installed'].includes(result.status))
      if (result)
        setClaudeMessage(
          result.message ??
            (!succeeded
              ? 'Claude 연결 설정을 변경하지 못했습니다.'
              : disconnect
                ? 'Claude 연결을 해제했습니다.'
                : '연결했습니다. Claude를 실행하면 사용량과 세션 상태가 표시됩니다.')
        )
      refreshClaudeStatus()
    } catch (error) {
      setClaudeMessage(
        error instanceof Error
          ? error.message
          : '연결 설정을 변경하지 못했습니다.'
      )
    } finally {
      setClaudeBusy(false)
    }
  }
  const connected = Boolean(
    claudeStatus?.statusLineInstalled && claudeStatus?.hooksInstalled
  )
  return (
    <main className="settings-window mac-surface" aria-label="CodeMung 설정">
      <header className="settings-titlebar">
        <span className="settings-window-title">CodeMung 설정</span>
        <div
          className="settings-toolbar"
          role="tablist"
          aria-label="설정 항목"
          onKeyDown={(event) => {
            const tabs = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="tab"]'
              )
            )
            const current = tabs.indexOf(
              document.activeElement as HTMLButtonElement
            )
            if (current < 0) return
            let next = current
            if (event.key === 'ArrowRight') next = (current + 1) % tabs.length
            else if (event.key === 'ArrowLeft')
              next = (current - 1 + tabs.length) % tabs.length
            else if (event.key === 'Home') next = 0
            else if (event.key === 'End') next = tabs.length - 1
            else return
            event.preventDefault()
            setPane(SETTINGS_PANES[next].id)
            tabs[next].focus()
          }}
        >
          {SETTINGS_PANES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={pane === item.id}
              aria-controls="settings-pane"
              tabIndex={pane === item.id ? 0 : -1}
              onClick={() => setPane(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>
      <div
        className="settings-pane"
        id="settings-pane"
        role="tabpanel"
        aria-labelledby={`tab-${pane}`}
        tabIndex={0}
        key={pane}
      >
        <div className="settings-pane-heading">
          <h1>{paneLabel}</h1>
          <p>
            {
              {
                general: '데스크톱에 함께할 오브제를 설정합니다.',
                sound: '필요한 순간에만, 가벼운 소리로.',
                connection: '사용 중인 코딩 도구를 연결합니다.',
                about: '데스크톱을 위한 작은 동반자.'
              }[pane]
            }
          </p>
        </div>
        {pane === 'general' && (
          <>
            <section
              className="settings-group"
              aria-labelledby="object-size-heading"
            >
              <h2 id="object-size-heading">오브제</h2>
              <div className="settings-group-content">
                <div
                  className="object-picker"
                  role="radiogroup"
                  aria-label="오브제 종류"
                >
                  {registeredMotionPacks.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={objectId === option.id}
                      className="object-option"
                      onClick={() => {
                        setObjectId(option.id)
                        window.codemung?.setObjectId?.(option.id)
                      }}
                    >
                      <span
                        className="object-option-preview"
                        aria-hidden="true"
                      >
                        <MotionScene
                          pack={option.id}
                          state="working"
                          size="small"
                        />
                      </span>
                      <span className="object-option-copy">
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                      <span className="object-option-check" aria-hidden="true">
                        {objectId === option.id ? '✓' : ''}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="setting-row">
                  <span>
                    <strong>오브제 크기</strong>
                    <small>화면에 맞는 크기를 선택하세요.</small>
                  </span>
                  <div
                    className="settings-segmented"
                    role="radiogroup"
                    aria-label="오브제 크기"
                    onKeyDown={(event) => {
                      const index = OBJECT_SIZE_OPTIONS.findIndex(
                        (option) => option.value === objectSize
                      )
                      const direction =
                        event.key === 'ArrowRight' || event.key === 'ArrowDown'
                          ? 1
                          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                            ? -1
                            : 0
                      if (!direction) return
                      event.preventDefault()
                      const next =
                        (index + direction + OBJECT_SIZE_OPTIONS.length) %
                        OBJECT_SIZE_OPTIONS.length
                      const value = OBJECT_SIZE_OPTIONS[next].value
                      setObjectSize(value)
                      updateObjectSize(value)
                      event.currentTarget
                        .querySelectorAll<HTMLButtonElement>('[role="radio"]')
                        [next].focus()
                    }}
                  >
                    {OBJECT_SIZE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={objectSize === option.value}
                        tabIndex={objectSize === option.value ? 0 : -1}
                        onClick={() => {
                          setObjectSize(option.value)
                          updateObjectSize(option.value)
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            <p className="settings-footnote">
              오브제를 클릭하면 활성 세션을, 메뉴 막대 아이콘을 클릭하면 남은
              사용량을 볼 수 있습니다.
            </p>
          </>
        )}
        {pane === 'sound' && (
          <>
            <section className="settings-group" aria-labelledby="sound-heading">
              <h2 id="sound-heading">효과음</h2>
              <div className="settings-group-content">
                <div className="setting-row">
                  <span id="sound-toggle-label">
                    <strong>효과음 사용</strong>
                    <small>오브제 클릭과 작업 상태 변경을 알려줍니다.</small>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-labelledby="sound-toggle-label"
                    aria-checked={sound.enabled}
                    className="settings-switch"
                    onClick={() => {
                      const next = { ...sound, enabled: !sound.enabled }
                      saveSoundPreference(next)
                      setSound(next)
                    }}
                  >
                    <span />
                  </button>
                </div>
                <label className="setting-row">
                  <span>
                    <strong>음량</strong>
                  </span>
                  <span className="sound-volume">
                    <input
                      aria-label="효과음 음량"
                      type="range"
                      min="0"
                      max="100"
                      disabled={!sound.enabled}
                      value={Math.round(sound.volume * 100)}
                      onChange={(event) => {
                        const next = {
                          ...sound,
                          volume: Number(event.target.value) / 100
                        }
                        saveSoundPreference(next)
                        setSound(next)
                      }}
                    />
                    <output>{Math.round(sound.volume * 100)}%</output>
                  </span>
                </label>
                <div className="setting-row">
                  <span>
                    <strong>Soft</strong>
                    <small>따뜻하고 부드러운 사운드</small>
                  </span>
                  <button
                    className="mac-button"
                    type="button"
                    disabled={!sound.enabled}
                    onClick={() => playSound('complete')}
                  >
                    미리 듣기
                  </button>
                </div>
              </div>
            </section>
            <p className="settings-footnote">
              앱을 실행한 뒤 오브제를 한 번 눌러 주세요. 작업 중에는 반복음을
              재생하지 않습니다.
            </p>
          </>
        )}
        {pane === 'connection' && (
          <>
            <section
              className="settings-group"
              aria-labelledby="claude-heading"
            >
              <h2 id="claude-heading">Claude</h2>
              <div className="settings-group-content">
                <div className="setting-row">
                  <span>
                    <strong>Claude 연결</strong>
                    <small>사용량과 작업 상태를 함께 확인합니다.</small>
                  </span>
                  <span
                    className={`connection-label${connected ? ' connection-label--ready' : ''}`}
                  >
                    <i aria-hidden="true" />
                    {connected ? '연결됨' : '연결 안 됨'}
                  </span>
                </div>
                <div className="setting-row">
                  <span>
                    <strong>사용량</strong>
                  </span>
                  <span className="setting-value">
                    {claudeStatus?.statusLineInstalled ? '연결됨' : '연결 필요'}
                  </span>
                </div>
                <div className="setting-row">
                  <span>
                    <strong>세션 상태</strong>
                  </span>
                  <span className="setting-value">
                    {claudeStatus?.hooksInstalled ? '연결됨' : '연결 필요'}
                  </span>
                </div>
                <div className="settings-connection-actions">
                  <button
                    className="mac-button"
                    type="button"
                    disabled={
                      claudeBusy ||
                      (!claudeStatus?.statusLineInstalled &&
                        !claudeStatus?.hooksInstalled)
                    }
                    onClick={() => void changeConnection(true)}
                  >
                    연결 해제
                  </button>
                  <button
                    className="mac-button mac-button--primary"
                    type="button"
                    disabled={claudeBusy}
                    onClick={() => void changeConnection()}
                  >
                    {claudeBusy
                      ? '변경 중…'
                      : claudeStatus?.statusLineInstalled ||
                          claudeStatus?.hooksInstalled
                        ? '다시 연결'
                        : '연결'}
                  </button>
                </div>
              </div>
            </section>
            {claudeStatus?.backupConflict && (
              <p className="settings-warning" role="alert">
                이전 설정의 백업이 남아 있습니다. Claude 설정과 백업 파일을
                확인한 뒤 다시 연결해 주세요. 기존 파일은 덮어쓰지 않습니다.
              </p>
            )}
            {claudeMessage && (
              <p className="settings-inline-message" role="status">
                {claudeMessage}
              </p>
            )}
            <details className="connection-details">
              <summary>연결 진단</summary>
              <dl>
                <div>
                  <dt>로컬 수신기</dt>
                  <dd>
                    {claudeStatus?.listener.listening ? '정상' : '연결 안 됨'}
                  </dd>
                </div>
                <div>
                  <dt>마지막 사용량 수신</dt>
                  <dd>
                    {claudeStatus?.listener.receivedAt
                      ? new Date(
                          claudeStatus.listener.receivedAt
                        ).toLocaleTimeString()
                      : '수신 기록 없음'}
                  </dd>
                </div>
                <div>
                  <dt>마지막 상태 수신</dt>
                  <dd>
                    {claudeStatus?.hookDiagnostics.receivedAt
                      ? new Date(
                          claudeStatus.hookDiagnostics.receivedAt
                        ).toLocaleTimeString()
                      : '수신 기록 없음'}
                  </dd>
                </div>
              </dl>
            </details>
            <p className="settings-footnote">
              Codex는 로컬 로그인 정보를 자동으로 사용합니다.
            </p>
          </>
        )}
        {pane === 'about' && (
          <>
            <div className="settings-about">
              <div className="settings-about-object" aria-hidden="true">
                <MotionScene pack={objectId} state="working" size="small" />
              </div>
              <h2>CodeMung</h2>
              <p>코딩하는 동안, 곁에서.</p>
              <span>
                {appInfo ? `버전 ${appInfo.version}` : '버전 확인 중'}
              </span>
            </div>
            <section className="settings-group" aria-label="업데이트">
              <div className="settings-group-content">
                <div className="setting-row">
                  <span>
                    <strong>업데이트</strong>
                    <small>GitHub에서 최신 릴리스를 확인합니다.</small>
                  </span>
                  <button
                    className="mac-button"
                    type="button"
                    onClick={() => void window.codemung?.openReleases()}
                  >
                    업데이트 확인…
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function App(): React.JSX.Element {
  if (window.location.hash === '#usage') return <UsagePopover />
  const isSettingsWindow = window.location.hash === '#settings'
  const [appInfo, setAppInfo] = useState<CodeMungAppInfo | null>(null)
  const sessionStore = useMemo(() => createSessionStore([]), [])
  const [objectSize, setObjectSize] = useState<ObjectSize>('medium')
  const [objectId, setObjectId] = useState<ObjectId>(DEFAULT_OBJECT_ID)

  useEffect(() => {
    if (isSettingsWindow) void window.codemung?.getAppInfo().then(setAppInfo)
  }, [isSettingsWindow])

  useEffect(() => {
    if (isSettingsWindow) return
    const observeSound = createSessionSoundObserver()
    let receivedLive = false
    const unsubscribe = window.codemung?.onSessions((sessions) => {
      receivedLive = true
      observeSound(sessions)
      sessionStore.replace(sessions)
    })
    void window.codemung?.getSessions().then((sessions) => {
      if (sessions && !receivedLive) {
        observeSound(sessions)
        sessionStore.replace(sessions)
      }
    })
    return unsubscribe
  }, [isSettingsWindow, sessionStore])

  useEffect(() => {
    const unsubscribe = subscribeObjectSize(setObjectSize)
    void getObjectSizeApi()?.().then((size) => {
      if (size) setObjectSize(size)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeObjectId(setObjectId)
    void window.codemung?.getObjectId?.().then((id) => {
      if (id) setObjectId(id)
    })
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
      onPanelOpenChange={(isOpen) =>
        window.codemung?.setSessionPanelOpen(isOpen)
      }
      onDragStart={({ startScreenX, startScreenY }) =>
        window.codemung?.startCompanionDrag(startScreenX, startScreenY)
      }
      onDrag={({ screenX, screenY }) =>
        window.codemung?.moveCompanion(screenX, screenY)
      }
      onDragEnd={() => window.codemung?.endCompanionDrag()}
    />
  )
}

export default App
