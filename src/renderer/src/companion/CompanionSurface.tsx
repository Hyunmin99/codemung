import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { getExpandedCompanionWindowSize } from '../../../shared/companion-window'
import type { SessionStore } from '../session/session-store'
import { ContextPanel } from '../session/ContextPanel'
import { MotionScene } from '../motion/MotionScene'

const CLICK_DRAG_THRESHOLD_PX = 5

type SessionPanelStyle = CSSProperties & Record<
  '--session-panel-top' | '--session-panel-width' | '--session-panel-height',
  string
>

export interface CompanionDragPosition {
  startScreenX: number
  startScreenY: number
  screenX: number
  screenY: number
}

interface CompanionSurfaceProps {
  store: SessionStore
  onDrag: (position: CompanionDragPosition) => void
  size?: ObjectSize
  objectId?: import('../../../shared/object').ObjectId
  onDragStart?: (position: Pick<CompanionDragPosition, 'startScreenX' | 'startScreenY'>) => void
  onDragEnd?: () => void
  onPanelOpenChange?: (isOpen: boolean) => void
}

interface PointerStart {
  pointerId: number
  clientX: number
  clientY: number
  screenX: number
  screenY: number
  dragged: boolean
}

function movedAtLeastThreshold(start: PointerStart, event: React.PointerEvent<HTMLElement>): boolean {
  return Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) >= CLICK_DRAG_THRESHOLD_PX
}

export function CompanionSurface({
  store,
  onDrag,
  size = 'medium',
  objectId = 'lava',
  onDragStart,
  onDragEnd,
  onPanelOpenChange
}: CompanionSurfaceProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState(() => store.getSnapshot())
  const [isPanelOpen, setPanelOpen] = useState(false)
  const pointerStart = useRef<PointerStart | null>(null)
  const ignoreNextClick = useRef(false)
  const expandedLayout = getExpandedCompanionWindowSize(
    size === 'small' ? { width: 120, height: 136 } : size === 'large' ? { width: 180, height: 204 } : { width: 150, height: 170 }
  )
  const panelStyle: SessionPanelStyle = {
    '--session-panel-top': `${expandedLayout.panelTop}px`,
    '--session-panel-width': `${expandedLayout.panelWidth}px`,
    '--session-panel-height': `${expandedLayout.panelHeight}px`
  }

  useEffect(() => store.subscribe(setSnapshot), [store])

  const updatePanelOpen = (next: boolean): void => {
    setPanelOpen(next)
    onPanelOpenChange?.(next)
  }

  const togglePanel = (): void => updatePanelOpen(!isPanelOpen)

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pointerStart.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      dragged: false
    }
    onDragStart?.({ startScreenX: event.screenX, startScreenY: event.screenY })
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const start = pointerStart.current
    if (!start || start.pointerId !== event.pointerId) return
    if (!start.dragged && movedAtLeastThreshold(start, event)) start.dragged = true
    if (!start.dragged) return
    onDrag({
      startScreenX: start.screenX,
      startScreenY: start.screenY,
      screenX: event.screenX,
      screenY: event.screenY
    })
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const start = pointerStart.current
    if (!start || start.pointerId !== event.pointerId || event.button !== 0) return
    pointerStart.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    ignoreNextClick.current = true
    if (start.dragged || movedAtLeastThreshold(start, event)) {
      onDragEnd?.()
      return
    }
    onDragEnd?.()
    togglePanel()
  }

  return (
    <main className={`companion${isPanelOpen ? ' companion--panel-open' : ''}`} style={isPanelOpen ? panelStyle : undefined} aria-label={`코드멍 ${objectId} 오브제`} onPointerDown={(event) => {
      if (isPanelOpen && event.target === event.currentTarget) updatePanelOpen(false)
    }}>
      <button
        className="companion-trigger"
        type="button"
        data-object-size={size}
        aria-label={isPanelOpen ? '세션 목록 닫기' : '세션 목록 열기'}
        aria-expanded={isPanelOpen}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { pointerStart.current = null; onDragEnd?.() }}
        onClick={() => {
          if (ignoreNextClick.current) { ignoreNextClick.current = false; return }
          togglePanel()
        }}
      >
        <MotionScene pack={objectId} state={snapshot.representativeState} size={size} />
      </button>
      {isPanelOpen && <ContextPanel snapshot={snapshot} onClose={() => updatePanelOpen(false)} />}
      <p className="sr-only" aria-live="polite">현재 대표 상태: {snapshot.representativeState}</p>
    </main>
  )
}
