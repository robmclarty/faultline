import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { create_spinner, _reset_spinner } from '../spinner.js'

beforeEach(() => {
  _reset_spinner()
  vi.useFakeTimers()
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  _reset_spinner()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('create_spinner', () => {
  it('writes spinner frames to stderr', () => {
    const spinner = create_spinner('Loading')

    vi.advanceTimersByTime(160) // 2 frames

    expect(process.stderr.write).toHaveBeenCalled()

    const calls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls
    const output = calls.map(c => c[0]).join('')

    expect(output).toContain('Loading')

    spinner.stop()
  })

  it('clears line and prints final message on stop', () => {
    const spinner = create_spinner('Working')

    vi.advanceTimersByTime(80)
    spinner.stop('Done!')

    expect(console.log).toHaveBeenCalledWith('Done!')
  })

  it('stops without final message', () => {
    const spinner = create_spinner('Working')

    vi.advanceTimersByTime(80)
    spinner.stop()

    expect(console.log).not.toHaveBeenCalled()
  })

  it('handles multiple concurrent spinners without errors', () => {
    const s1 = create_spinner('Task A')
    const s2 = create_spinner('Task B')
    const s3 = create_spinner('Task C')

    vi.advanceTimersByTime(240)

    // Most recent spinner (Task C) should be rendered
    const calls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls
    const last_output = calls[calls.length - 1][0]

    expect(last_output).toContain('Task C')

    s1.stop()
    s2.stop()
    s3.stop()
  })

  it('update changes the displayed message', () => {
    const spinner = create_spinner('Starting')

    spinner.update('Almost done')
    vi.advanceTimersByTime(80)

    const calls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls
    const last_output = calls[calls.length - 1][0]

    expect(last_output).toContain('Almost done')

    spinner.stop()
  })

  it('stops interval when all spinners are stopped', () => {
    const s1 = create_spinner('A')
    const s2 = create_spinner('B')

    vi.advanceTimersByTime(80)

    s1.stop()
    s2.stop()

    // Clear mock after stop() calls (which write to clear the line)
    ;(process.stderr.write as ReturnType<typeof vi.fn>).mockClear()

    vi.advanceTimersByTime(240)

    // No more writes after all spinners stopped
    expect(process.stderr.write).not.toHaveBeenCalled()
  })
})
