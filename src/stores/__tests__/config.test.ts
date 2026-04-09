import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'

import { resolve_config } from '../config.js'

describe('resolve_config', () => {
  it('resolves target_dir to absolute path', () => {
    const config = resolve_config('./some-dir')

    expect(config.target_dir).toBe(resolve('./some-dir'))
  })

  it('uses defaults when no overrides provided', () => {
    const config = resolve_config('/test')

    expect(config.model).toBe('sonnet')
    expect(config.context_budget).toBe(150_000)
    expect(config.timeout).toBe(300_000)
    expect(config.max_retries).toBe(3)
    expect(config.verbose).toBe(false)
  })

  it('overrides defaults with CLI flags', () => {
    const config = resolve_config('/test', {
      model: 'opus',
      timeout: 60_000,
      verbose: true
    })

    expect(config.model).toBe('opus')
    expect(config.timeout).toBe(60_000)
    expect(config.verbose).toBe(true)
  })

  it('ignores undefined overrides', () => {
    const config = resolve_config('/test', {
      model: undefined,
      timeout: 60_000
    })

    expect(config.model).toBe('sonnet')
    expect(config.timeout).toBe(60_000)
  })

  it('always uses resolved target_dir regardless of overrides', () => {
    const config = resolve_config('/test', {
      target_dir: '/other' as string
    })

    expect(config.target_dir).toBe(resolve('/test'))
  })
})
