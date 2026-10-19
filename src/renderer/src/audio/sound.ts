import { createUISFX, type CueName, type UISFXPlayer } from 'uisfx'
import type { AgentState, SessionRecord } from '../../../shared/session'

export const SOUND_KEY = 'codemung:sound'
export const SOUND_PACK = 'soft'
export interface SoundPreference {
  enabled: boolean
  volume: number
}
const defaults: SoundPreference = { enabled: true, volume: 0.7 }
let player: UISFXPlayer | undefined
let context: AudioContext | undefined
let unlocked = false

export function getSoundPreference(): SoundPreference {
  try {
    const value = JSON.parse(window.localStorage.getItem(SOUND_KEY) ?? 'null')
    return {
      enabled:
        typeof value?.enabled === 'boolean' ? value.enabled : defaults.enabled,
      volume:
        typeof value?.volume === 'number' && Number.isFinite(value.volume)
          ? Math.max(0, Math.min(1, value.volume))
          : defaults.volume
    }
  } catch {
    return { ...defaults }
  }
}

function applyPreference(preference: SoundPreference): void {
  if (!preference.enabled) player?.stopAll()
  player?.setEnabled(preference.enabled)
  player?.setVolume(preference.volume)
  player?.setPack(SOUND_PACK)
}

export function saveSoundPreference(preference: SoundPreference): void {
  try {
    window.localStorage.setItem(SOUND_KEY, JSON.stringify(preference))
  } catch {
    /* Keep session controls usable when storage is unavailable. */
  }
  applyPreference(preference)
}

export function playSound(cue: CueName): void {
  if (!unlocked || !player || context?.state !== 'running') return
  try {
    player.play(cue)
  } catch {
    /* Audio must never interrupt a product action. */
  }
}

// Install once at the renderer entry point, outside React's remount lifecycle.
export function installSound(): () => Promise<void> {
  const unlock = (event: Event): void => {
    if (!event.isTrusted || !getSoundPreference().enabled) return
    if (
      event instanceof KeyboardEvent &&
      (event.repeat || event.metaKey || event.ctrlKey || event.altKey)
    )
      return
    try {
      if (!context) {
        context = new AudioContext()
        player = createUISFX({
          ...getSoundPreference(),
          pack: SOUND_PACK,
          context
        })
      }
      // Resume synchronously in the gesture, never from an effect or an async outcome.
      const activeContext = context
      void activeContext
        .resume()
        .then(() => {
          if (context === activeContext)
            unlocked = activeContext.state === 'running'
        })
        .catch(() => {
          unlocked = false
        })
      unlocked = activeContext.state === 'running'
    } catch {
      unlocked = false
    }
  }
  const sync = (event: StorageEvent): void => {
    if (event.key === SOUND_KEY || event.key === null)
      applyPreference(getSoundPreference())
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
  window.addEventListener('storage', sync)
  const dispose = async (): Promise<void> => {
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
    window.removeEventListener('storage', sync)
    window.removeEventListener('pagehide', onPageHide)
    unlocked = false
    const previousPlayer = player
    const previousContext = context
    player = undefined
    context = undefined
    previousPlayer?.stopAll()
    try {
      await previousPlayer?.destroy()
    } finally {
      if (previousContext && previousContext.state !== 'closed')
        await previousContext.close()
    }
  }
  const onPageHide = (): void => {
    void dispose().catch(() => {})
  }
  window.addEventListener('pagehide', onPageHide)
  return dispose
}

export const STATE_CUES: Partial<Record<AgentState, CueName>> = {
  working: 'start',
  waiting_permission: 'notification',
  completed: 'complete',
  error: 'error'
}

// Compare real session events, not representative-state fallbacks or expiry timers.
export function createSessionSoundObserver(): (
  sessions: readonly SessionRecord[]
) => void {
  let previous: Map<string, SessionRecord> | undefined
  let lastPlayedAt = -Infinity
  let lastCue: CueName | undefined
  return (sessions) => {
    const next = new Map(
      sessions.map((session) => [
        `${session.provider}:${session.sessionId}`,
        session
      ])
    )
    if (previous) {
      const changed = sessions.filter((session) => {
        const old = previous?.get(`${session.provider}:${session.sessionId}`)
        return (
          session.state !== old?.state &&
          (!old || session.updatedAt >= old.updatedAt) &&
          Date.now() - session.updatedAt < 8_000
        )
      })
      const selected = (
        ['error', 'waiting_permission', 'completed', 'working'] as const
      ).find((state) => changed.some((session) => session.state === state))
      if (
        selected &&
        (STATE_CUES[selected] !== lastCue || Date.now() - lastPlayedAt >= 500)
      ) {
        playSound(STATE_CUES[selected]!)
        lastPlayedAt = Date.now()
        lastCue = STATE_CUES[selected]
      }
    }
    previous = next
  }
}
