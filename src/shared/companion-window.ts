export interface CompanionScreenPoint {
  screenX: number
  screenY: number
}

export interface CompanionBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface CompanionSize {
  width: number
  height: number
}

export const SESSION_PANEL_LAYOUT = Object.freeze({
  panelWidth: 280,
  panelHeight: 220,
  gap: 10,
  horizontalInset: 12,
  bottomInset: 12
})

export function getExpandedCompanionWindowSize(companion: CompanionSize): {
  window: CompanionSize
  panelWidth: number
  panelHeight: number
  panelTop: number
  gap: number
} {
  const { panelWidth, panelHeight, gap, horizontalInset, bottomInset } = SESSION_PANEL_LAYOUT
  return {
    window: {
      width: Math.max(companion.width, panelWidth + horizontalInset * 2),
      height: companion.height + gap + panelHeight + bottomInset
    },
    panelWidth,
    panelHeight,
    panelTop: companion.height + gap,
    gap,
  }
}

export function expandedBoundsForSessionPanel(
  compactBounds: CompanionBounds,
  expandedSize: CompanionSize
): CompanionBounds {
  return {
    x: Math.round(compactBounds.x - (expandedSize.width - compactBounds.width) / 2),
    y: compactBounds.y,
    ...expandedSize
  }
}

export function createCompanionDragStartPayload(screenX: number, screenY: number): CompanionScreenPoint {
  return { screenX, screenY }
}

export function isCompanionScreenPoint(value: unknown): value is CompanionScreenPoint {
  if (!value || typeof value !== 'object') return false
  const point = value as Partial<CompanionScreenPoint>
  return Number.isFinite(point.screenX) && Number.isFinite(point.screenY)
}

export function compactBoundsForPersistence(
  bounds: CompanionBounds,
  compactSize: Pick<CompanionBounds, 'width' | 'height'>
): CompanionBounds {
  return {
    x: Math.round(bounds.x + (bounds.width - compactSize.width) / 2),
    y: bounds.y,
    ...compactSize
  }
}
