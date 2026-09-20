import { describe, expect, it } from 'vitest'
import { DEFAULT_OBJECT_ID, isRegisteredObjectId } from '../../../shared/object'

describe('object selection contract', () => {
  it('uses lava as the default object', () => {
    expect(DEFAULT_OBJECT_ID).toBe('lava')
    expect(isRegisteredObjectId(DEFAULT_OBJECT_ID)).toBe(true)
  })

  it('rejects stale or malformed persisted identifiers', () => {
    expect(isRegisteredObjectId('retired-object')).toBe(false)
    expect(isRegisteredObjectId(undefined)).toBe(false)
    expect(isRegisteredObjectId({ id: 'lava' })).toBe(false)
  })
})
