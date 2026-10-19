/* @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { UsagePopover } from './UsagePopover'

const snapshot: UsageSnapshot = {
  codex: {
    provider: 'codex',
    status: 'ready',
    updatedAt: Date.now(),
    buckets: [
      {
        id: 'one',
        label: '기본',
        fiveHour: {
          usedPercent: 37,
          resetsAt: Date.now() + 3600_000,
          windowDurationMins: 300
        },
        weekly: null
      },
      {
        id: 'two',
        label: '추가',
        fiveHour: { usedPercent: 100, resetsAt: null, windowDurationMins: 300 },
        weekly: null
      }
    ]
  },
  claude: {
    provider: 'claude',
    status: 'login-required',
    updatedAt: null,
    buckets: []
  }
}
beforeEach(() => {
  window.codemung = {
    getUsageSnapshot: vi.fn(async () => snapshot),
    onUsageSnapshot: vi.fn(() => vi.fn()),
    setUsageBucket: vi.fn(),
    closeUsage: vi.fn(),
    openSettings: vi.fn(),
    refreshUsage: vi.fn(async () => snapshot)
  } as unknown as CodeMungApi
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'codemung')
})

it('distinguishes unknown usage from zero and changes the selected bucket', async () => {
  render(<UsagePopover />)
  await screen.findByText('63%')
  expect(screen.getAllByText('정보 없음').length).toBeGreaterThan(0)
  expect(screen.getByText('로그인 필요')).toBeVisible()
  fireEvent.change(screen.getByRole('combobox', { name: '한도 구분' }), {
    target: { value: 'two' }
  })
  expect(window.codemung.setUsageBucket).toHaveBeenLastCalledWith('two')
  expect(screen.getByText('0%')).toBeVisible()
  expect(screen.getAllByRole('progressbar')[0]).toHaveAttribute(
    'aria-valuenow',
    '0'
  )
})

it('waits for refresh, reports errors, and closes the panel before opening settings', async () => {
  let reject!: (error: Error) => void
  vi.mocked(window.codemung.refreshUsage).mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail
      })
  )
  render(<UsagePopover />)
  await screen.findByText('63%')
  fireEvent.click(screen.getByRole('button', { name: '새로 고침' }))
  expect(screen.getByRole('button', { name: '새로 고침' })).toBeDisabled()
  await act(async () => reject(new Error('갱신 실패')))
  expect(screen.getByRole('alert')).toHaveTextContent('갱신 실패')
  fireEvent.click(screen.getByRole('button', { name: '설정…' }))
  expect(window.codemung.closeUsage).toHaveBeenCalledOnce()
  expect(
    vi.mocked(window.codemung.closeUsage).mock.invocationCallOrder[0]
  ).toBeLessThan(
    vi.mocked(window.codemung.openSettings).mock.invocationCallOrder[0]
  )
  fireEvent.keyDown(window, { key: 'Escape' })
  await waitFor(() =>
    expect(window.codemung.closeUsage).toHaveBeenCalledTimes(2)
  )
})
