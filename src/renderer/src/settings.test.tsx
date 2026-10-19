/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

let saved: Map<string, string>
beforeEach(() => {
  saved = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value)
    }
  })
  window.location.hash = '#settings'
  window.codemung = {
    getAppInfo: vi.fn(async () => ({
      name: 'CodeMung',
      version: '0.1.1',
      platform: 'darwin'
    })),
    getClaudeConnectionStatus: vi.fn(async () => undefined),
    getObjectId: vi.fn(async () => 'lava'),
    getObjectSize: vi.fn(async () => 'medium'),
    setObjectSize: vi.fn()
  } as unknown as CodeMungApi
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  Reflect.deleteProperty(window, 'codemung')
})

describe('macOS settings panes', () => {
  it('shows one pane at a time, supports arrow keys and restores the last pane on reopening', async () => {
    const view = render(<App />)
    await act(async () => {})
    const general = screen.getByRole('tab', { name: '일반' })
    expect(general).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    general.focus()
    fireEvent.keyDown(general, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: '소리' })).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: '소리' })).toBeVisible()
    expect(document.title).toBe('소리 — CodeMung 설정')
    expect(
      screen.queryByRole('radiogroup', { name: '오브제 크기' })
    ).not.toBeInTheDocument()
    view.unmount()
    render(<App />)
    await act(async () => {})
    expect(screen.getByRole('tab', { name: '소리' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('persists the sound switch and disables both playback and volume while muted', async () => {
    render(<App />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('tab', { name: '소리' }))
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('slider', { name: '효과음 음량' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '미리 듣기' })).toBeDisabled()
    expect(JSON.parse(saved.get('codemung:sound')!)).toEqual({
      enabled: false,
      volume: 0.7
    })
  })

  it('keeps connection diagnostics available without competing with the main action', async () => {
    render(<App />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('tab', { name: '연결' }))
    expect(screen.getByRole('button', { name: '연결' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '연결 해제' })).toBeDisabled()
    const disclosure = screen.getByText('연결 진단')
    expect(disclosure.closest('details')).not.toHaveAttribute('open')
    fireEvent.click(disclosure)
    expect(disclosure.closest('details')).toHaveAttribute('open')
  })
})
