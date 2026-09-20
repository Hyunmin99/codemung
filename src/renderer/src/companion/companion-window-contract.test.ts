import { describe, expect, it } from 'vitest'
import {
  compactBoundsForPersistence,
  createCompanionDragStartPayload,
  expandedBoundsForSessionPanel,
  getExpandedCompanionWindowSize,
  isCompanionScreenPoint
} from '../../../shared/companion-window'

describe('companion window IPC contract', () => {
  it('creates the drag-start payload that the main-process validator accepts', () => {
    const payload = createCompanionDragStartPayload(348, 912)

    expect(payload).toEqual({ screenX: 348, screenY: 912 })
    expect(isCompanionScreenPoint(payload)).toBe(true)
  })

  it('persists an expanded panel at the selected compact companion size', () => {
    expect(compactBoundsForPersistence(
      { x: 1200, y: 300, width: 336, height: 320 },
      { width: 180, height: 204 }
    )).toEqual({ x: 1278, y: 300, width: 180, height: 204 })
  })

  it('places the session panel below a centered large companion', () => {
    const companion = { width: 180, height: 204 }
    const layout = getExpandedCompanionWindowSize(companion)
    const companionLeft = (layout.window.width - companion.width) / 2
    const panelLeft = (layout.window.width - layout.panelWidth) / 2

    expect(panelLeft).toBeGreaterThanOrEqual(0)
    expect(layout.panelTop).toBeGreaterThanOrEqual(companion.height + layout.gap)
    expect(layout.panelTop + layout.panelHeight).toBeLessThanOrEqual(layout.window.height)
    expect(companionLeft + companion.width / 2).toBe(layout.window.width / 2)
  })

  it('keeps the companion screen position stable when the panel opens below it', () => {
    const compact = { x: 1200, y: 300, width: 180, height: 204 }
    const expandedSize = getExpandedCompanionWindowSize(compact).window

    const expanded = expandedBoundsForSessionPanel(compact, expandedSize)

    expect(expanded.x + (expanded.width - compact.width) / 2).toBe(compact.x)
    expect(expanded.y).toBe(compact.y)
    expect(compactBoundsForPersistence(expanded, compact)).toEqual(compact)
  })
})
