/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSessionStore } from '../session/session-store'
import { CompanionSurface } from './CompanionSurface'

const NOW = 1_000_000

afterEach(cleanup)

function renderCompanion(sessions = [
  { provider: 'claude' as const, sessionId: 'c1', projectName: '/Users/me/Projects/codemung', state: 'working' as const, updatedAt: NOW },
  { provider: 'codex' as const, sessionId: 'x1', projectName: '/tmp/another-project', state: 'waiting_permission' as const, updatedAt: NOW }
]): void {
  render(<CompanionSurface store={createSessionStore(sessions, () => NOW)} onDrag={vi.fn()} />)
}

describe('CompanionSurface', () => {
  it.each([
    ['idle', '쉬는 중'],
    ['working', '작업 중'],
    ['waiting_permission', '확인 필요'],
    ['completed', '완료'],
    ['error', '오류']
  ] as const)('shows the %s representative state as a non-interactive label', (state, label) => {
    const store = createSessionStore(state === 'idle' ? [] : [
      { provider: 'codex', sessionId: 'x1', projectName: 'codemung', state, updatedAt: NOW }
    ], () => NOW)
    const { container } = render(<CompanionSurface store={store} onDrag={vi.fn()} />)

    const status = screen.getByText(label)
    expect(status).toHaveClass(`companion-state--${state}`)
    expect(status).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.companion')).toContainElement(status)
    expect(status).toHaveClass('companion-state')
  })

  it('updates the visible state label when the session snapshot changes', () => {
    const store = createSessionStore([], () => NOW)
    render(<CompanionSurface store={store} onDrag={vi.fn()} />)

    expect(screen.getByText('쉬는 중')).toBeInTheDocument()
    act(() => {
      store.replace([{ provider: 'claude', sessionId: 'c1', projectName: 'codemung', state: 'waiting_permission', updatedAt: NOW }])
    })

    expect(screen.getByText('확인 필요')).toBeInTheDocument()
    expect(screen.queryByText('쉬는 중')).not.toBeInTheDocument()
  })

  it('toggles the session list with a primary click on the visible companion', () => {
    renderCompanion()

    const companion = screen.getByRole('button', { name: '세션 목록 열기' })
    fireEvent.pointerDown(companion, { button: 0, clientX: 10, clientY: 10, screenX: 100, screenY: 100 })
    fireEvent.pointerUp(companion, { button: 0, clientX: 10, clientY: 10, screenX: 100, screenY: 100 })

    expect(screen.getByRole('dialog', { name: '활성 세션' })).toBeVisible()
    expect(screen.getByText('Claude')).toBeVisible()
    expect(screen.getByText('Codex')).toBeVisible()
  })

  it('does not toggle the session list after a drag of at least 5px', () => {
    const onDrag = vi.fn()
    render(<CompanionSurface store={createSessionStore([], () => NOW)} onDrag={onDrag} />)

    const companion = screen.getByRole('button', { name: '세션 목록 열기' })
    fireEvent.pointerDown(companion, { button: 0, clientX: 10, clientY: 10, screenX: 100, screenY: 100 })
    fireEvent.pointerMove(companion, { button: 0, clientX: 15, clientY: 10, screenX: 105, screenY: 100 })
    fireEvent.pointerUp(companion, { button: 0, clientX: 15, clientY: 10, screenX: 105, screenY: 100 })

    expect(screen.queryByRole('dialog', { name: '활성 세션' })).not.toBeInTheDocument()
    expect(onDrag).toHaveBeenCalledWith({ startScreenX: 100, startScreenY: 100, screenX: 105, screenY: 100 })
  })

  it('does not handle secondary clicks, leaving the native context menu unaffected', () => {
    renderCompanion()

    const companion = screen.getByRole('button', { name: '세션 목록 열기' })
    fireEvent.pointerDown(companion, { button: 2, clientX: 10, clientY: 10, screenX: 100, screenY: 100 })
    fireEvent.pointerUp(companion, { button: 2, clientX: 10, clientY: 10, screenX: 100, screenY: 100 })
    const contextMenu = fireEvent.contextMenu(companion)

    expect(contextMenu).toBe(true)
    expect(screen.queryByRole('dialog', { name: '활성 세션' })).not.toBeInTheDocument()
  })

  it('ends an in-progress native drag when the pointer is canceled', () => {
    const onDrag = vi.fn()
    const onDragEnd = vi.fn()
    render(<CompanionSurface store={createSessionStore([], () => NOW)} onDrag={onDrag} onDragEnd={onDragEnd} />)

    const companion = screen.getByRole('button', { name: '세션 목록 열기' })
    fireEvent.pointerDown(companion, { button: 0, clientX: 10, clientY: 10, screenX: 100, screenY: 100 })
    fireEvent.pointerMove(companion, { button: 0, clientX: 15, clientY: 10, screenX: 105, screenY: 100 })
    fireEvent.pointerCancel(companion)

    expect(onDrag).toHaveBeenCalledTimes(1)
    expect(onDragEnd).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: '활성 세션' })).not.toBeInTheDocument()
  })

  it('does not toggle the panel when a pre-threshold pointer is canceled', () => {
    const onDragEnd = vi.fn()
    render(<CompanionSurface store={createSessionStore([], () => NOW)} onDrag={vi.fn()} onDragEnd={onDragEnd} />)

    const companion = screen.getByRole('button', { name: '세션 목록 열기' })
    fireEvent.pointerDown(companion, { button: 0, clientX: 10, clientY: 10, screenX: 100, screenY: 100 })
    fireEvent.pointerCancel(companion)

    expect(onDragEnd).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: '활성 세션' })).not.toBeInTheDocument()
  })

  it('expands providers to show session project basenames', () => {
    renderCompanion()

    const companion = screen.getByRole('button', { name: '세션 목록 열기' })
    fireEvent.click(companion)
    fireEvent.click(screen.getByRole('button', { name: /Claude.*작업 중.*1개/ }))

    expect(screen.getByText('codemung')).toBeVisible()
    expect(screen.queryByText('/Users/me/Projects/codemung')).not.toBeInTheDocument()
  })

  it('shows an empty state when there are no active sessions', () => {
    renderCompanion([])

    fireEvent.click(screen.getByRole('button', { name: '세션 목록 열기' }))

    expect(screen.getByText('현재 활성 작업 없음')).toBeVisible()
  })
})
