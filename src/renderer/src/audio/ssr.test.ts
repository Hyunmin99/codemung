import { expect, it } from 'vitest'
import {
  createSessionSoundObserver,
  getSoundPreference,
  playSound
} from './sound'

it('imports safely without browser globals and never starts audio during SSR', () => {
  expect(typeof window).toBe('undefined')
  expect(getSoundPreference()).toEqual({ enabled: true, volume: 0.7 })
  expect(() => {
    playSound('complete')
    createSessionSoundObserver()([])
  }).not.toThrow()
})
