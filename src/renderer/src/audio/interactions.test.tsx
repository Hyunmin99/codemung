/* @vitest-environment jsdom */
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { ContextPanel } from '../session/ContextPanel'
import { CompanionSurface } from '../companion/CompanionSurface'
import { createSessionStore } from '../session/session-store'

const playSound = vi.hoisted(() => vi.fn())
vi.mock('./sound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sound')>()),
  playSound
}))
afterEach(() => {
  cleanup()
  window.location.hash = ''
  Reflect.deleteProperty(window, 'codemung')
  vi.clearAllMocks()
})

describe('semantic interaction sounds', () => {
  it('keeps list expansion, collapse, close button and Escape silent', () => {
    const store = createSessionStore([
      {
        provider: 'codex',
        sessionId: 'x',
        projectName: 'test',
        state: 'working',
        updatedAt: Date.now()
      }
    ])
    const onClose = vi.fn()
    render(<ContextPanel snapshot={store.getSnapshot()} onClose={onClose} />)
    const provider = screen.getByRole('button', { name: /Codex/ })
    fireEvent.click(provider)
    fireEvent.click(provider)
    fireEvent.click(screen.getByRole('button', { name: '세션 목록 닫기' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(playSound).not.toHaveBeenCalled()
  })

  it('focuses the session panel and dismisses it silently when the window loses focus', () => {
    const onClose = vi.fn()
    render(
      <ContextPanel
        snapshot={createSessionStore([]).getSnapshot()}
        onClose={onClose}
      />
    )
    expect(screen.getByRole('dialog', { name: '활성 세션' })).toHaveFocus()
    fireEvent.blur(window)
    expect(onClose).toHaveBeenCalledOnce()
    expect(playSound).not.toHaveBeenCalled()
  })

  it('plays one panel cue for a pointer activation and one for keyboard activation under StrictMode', () => {
    const store = createSessionStore([])
    render(
      <StrictMode>
        <CompanionSurface store={store} onDrag={vi.fn()} />
      </StrictMode>
    )
    expect(playSound).not.toHaveBeenCalled()
    const button = screen.getByRole('button', { name: '세션 목록 열기' })
    fireEvent.pointerDown(button, { pointerId: 1, button: 0 })
    fireEvent.pointerUp(button, { pointerId: 1, button: 0 })
    fireEvent.click(button)
    expect(playSound).toHaveBeenCalledExactlyOnceWith('open')
    fireEvent.click(button, { detail: 0 })
    expect(playSound.mock.calls).toEqual([['open'], ['close']])
  })

  it.each(['installed', 'error'] as const)(
    'keeps Claude connection result %s silent',
    async (status) => {
      window.location.hash = '#settings'
      let resolve!: (value: { status: string }) => void
      const connection = new Promise<{ status: string }>((done) => {
        resolve = done
      })
      window.codemung = {
        getAppInfo: vi.fn(async () => null),
        getClaudeConnectionStatus: vi.fn(async () => undefined),
        connectClaude: vi.fn(() => connection)
      } as unknown as NonNullable<Window['codemung']>
      render(<App />)
      fireEvent.click(screen.getByRole('tab', { name: '연결' }))
      fireEvent.click(screen.getByRole('button', { name: '연결' }))
      expect(playSound).not.toHaveBeenCalled()
      await act(async () => resolve({ status }))
      expect(playSound).not.toHaveBeenCalled()
    }
  )

  it('reports rejected connection requests visually without sound', async () => {
    window.location.hash = '#settings'
    window.codemung = {
      getAppInfo: vi.fn(async () => null),
      getClaudeConnectionStatus: vi.fn(async () => undefined),
      connectClaude: vi.fn(async () => {
        throw new Error('연결 실패')
      })
    } as unknown as NonNullable<Window['codemung']>
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '연결' }))
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '연결' }))
    )
    expect(playSound).not.toHaveBeenCalled()
    expect(screen.getByText('연결 실패')).toBeInTheDocument()
  })
})
