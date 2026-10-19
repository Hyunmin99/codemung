/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const player = vi.hoisted(() => ({
  play: vi.fn(() => null),
  stopAll: vi.fn(),
  destroy: vi.fn(async () => {}),
  setEnabled: vi.fn(),
  setVolume: vi.fn(),
  setPack: vi.fn()
}))
vi.mock('uisfx', () => ({ createUISFX: vi.fn(() => player) }))
let dispose: (() => Promise<void>) | undefined
let context: {
  state: string
  resume: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    }
  })
  context = {
    state: 'running',
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {
      context.state = 'closed'
    })
  }
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        return context
      }
    }
  )
})
afterEach(async () => {
  await dispose?.()
  dispose = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function setup() {
  const sound = await import('./sound')
  const listener = vi.spyOn(window, 'addEventListener')
  dispose = sound.installSound()
  const unlock = listener.mock.calls.find(
    ([name]) => name === 'pointerdown'
  )![1] as EventListener
  return { sound, unlock: () => unlock({ isTrusted: true } as Event) }
}

describe('sound service', () => {
  it('creates no audio at import or installation; ignores untrusted events and stale cues', async () => {
    const { sound } = await setup()
    const { createUISFX } = await import('uisfx')
    window.dispatchEvent(new Event('pointerdown'))
    sound.playSound('complete')
    expect(createUISFX).not.toHaveBeenCalled()
    expect(player.play).not.toHaveBeenCalled()
  })

  it('retains one player across gestures, tolerates null handles, and disposes in order', async () => {
    const { sound, unlock } = await setup()
    unlock()
    unlock()
    sound.playSound('open')
    const { createUISFX } = await import('uisfx')
    expect(createUISFX).toHaveBeenCalledTimes(1)
    expect(createUISFX).toHaveBeenCalledWith(
      expect.objectContaining({ pack: 'soft', volume: 0.7, enabled: true })
    )
    expect(player.play).toHaveBeenCalledExactlyOnceWith('open')
    await dispose!()
    dispose = undefined
    expect(player.stopAll).toHaveBeenCalled()
    expect(player.destroy).toHaveBeenCalledOnce()
    expect(context.close).toHaveBeenCalledOnce()
    expect(player.destroy.mock.invocationCallOrder[0]).toBeLessThan(
      context.close.mock.invocationCallOrder[0]
    )
  })

  it('persists mute and volume, stops immediately, and synchronizes other windows', async () => {
    const { sound, unlock } = await setup()
    unlock()
    sound.saveSoundPreference({ enabled: false, volume: 0.25 })
    expect(sound.getSoundPreference()).toEqual({ enabled: false, volume: 0.25 })
    expect(player.stopAll.mock.invocationCallOrder[0]).toBeLessThan(
      player.setEnabled.mock.invocationCallOrder[0]
    )
    expect(player.setEnabled).toHaveBeenLastCalledWith(false)
    window.localStorage.setItem(
      sound.SOUND_KEY,
      JSON.stringify({ enabled: true, volume: 0.4 })
    )
    window.dispatchEvent(new StorageEvent('storage', { key: sound.SOUND_KEY }))
    expect(player.setEnabled).toHaveBeenLastCalledWith(true)
    expect(player.setVolume).toHaveBeenLastCalledWith(0.4)
  })

  it('validates persisted preferences and survives unavailable storage', async () => {
    const { sound } = await setup()
    window.localStorage.setItem(sound.SOUND_KEY, '{broken')
    expect(sound.getSoundPreference()).toEqual({ enabled: true, volume: 0.7 })
    window.localStorage.setItem(
      sound.SOUND_KEY,
      '{"enabled":"false","volume":8}'
    )
    expect(sound.getSoundPreference()).toEqual({ enabled: true, volume: 1 })
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() =>
      sound.saveSoundPreference({ enabled: false, volume: 0.5 })
    ).not.toThrow()
  })

  it('suppresses suspended-context background cues instead of replaying them', async () => {
    const { sound, unlock } = await setup()
    context.state = 'suspended'
    unlock()
    sound.playSound('complete')
    context.state = 'running'
    await Promise.resolve()
    expect(player.play).not.toHaveBeenCalled()
    sound.playSound('error')
    expect(player.play).toHaveBeenCalledExactlyOnceWith('error')
  })

  it('removes gesture listeners on disposal and can initialize again', async () => {
    const { unlock } = await setup()
    unlock()
    await dispose!()
    dispose = undefined
    const { sound, unlock: unlockAgain } = await setup()
    sound.playSound('complete')
    expect(player.play).not.toHaveBeenCalled()
    context.state = 'running'
    unlockAgain()
    expect((await import('uisfx')).createUISFX).toHaveBeenCalledTimes(2)
  })

  it('maps only real new session transitions, suppressing hydration, repeats and expiry fallbacks', async () => {
    const { sound, unlock } = await setup()
    unlock()
    const observe = sound.createSessionSoundObserver()
    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const session = {
      provider: 'codex' as const,
      sessionId: 'x',
      projectName: 'test',
      state: 'working' as const,
      updatedAt: now
    }
    observe([session])
    expect(player.play).not.toHaveBeenCalled()
    for (const [state, cue] of [
      ['waiting_permission', 'notification'],
      ['working', 'start'],
      ['completed', 'complete'],
      ['error', 'error']
    ] as const) {
      now += 1000
      const next = { ...session, state, updatedAt: now }
      observe([next])
      observe([next])
      expect(player.play).toHaveBeenLastCalledWith(cue)
    }
    expect(player.play).toHaveBeenCalledTimes(4)
    observe([])
    now += 1000
    observe([{ ...session, state: 'completed', updatedAt: now - 60_000 }])
    expect(player.play).toHaveBeenCalledTimes(4)
  })
})
