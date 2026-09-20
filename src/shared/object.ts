/** Keep this list in sync with the renderer's registered object implementations. */
export const REGISTERED_OBJECT_IDS = ['lava'] as const

/** Stable identifier shared by settings, persistence, and the companion renderer. */
export type ObjectId = typeof REGISTERED_OBJECT_IDS[number]

export const DEFAULT_OBJECT_ID: ObjectId = 'lava'

export function isRegisteredObjectId(value: unknown): value is ObjectId {
  return typeof value === 'string' && (REGISTERED_OBJECT_IDS as readonly string[]).includes(value)
}
