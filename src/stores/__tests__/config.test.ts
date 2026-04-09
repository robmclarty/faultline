import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

import { resolve_config } from '../config.js'

const TMP_DIR = resolve('/tmp/faultline-config-test')
const OUTPUT_DIR = '.faultline'

describe('resolve_config', () => {
  beforeEach(() => {
    mkdirSync(join(TMP_DIR, OUTPUT_DIR), { recursive: true })
  })

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true })
  })

  it('resolves target_dir to absolute path', () => {
    const config = resolve_config('./some-dir')

    expect(config.target_dir).toBe(resolve('./some-dir'))
  })

  it('uses defaults when no overrides and no config.json', () => {
    rmSync(TMP_DIR, { recursive: true, force: true })
    const config = resolve_config('/nonexistent-dir')

    expect(config.model).toBe('sonnet')
    expect(config.context_budget).toBe(150_000)
    expect(config.timeout).toBe(300_000)
    expect(config.max_retries).toBe(3)
    expect(config.verbose).toBe(false)
  })

  it('config.json overrides defaults', () => {
    writeFileSync(
      join(TMP_DIR, OUTPUT_DIR, 'config.json'),
      JSON.stringify({ model: 'opus', timeout: 120_000 })
    )

    const config = resolve_config(TMP_DIR)

    expect(config.model).toBe('opus')
    expect(config.timeout).toBe(120_000)
    // Unset fields still use defaults
    expect(config.context_budget).toBe(150_000)
    expect(config.max_retries).toBe(3)
  })

  it('CLI flags override config.json', () => {
    writeFileSync(
      join(TMP_DIR, OUTPUT_DIR, 'config.json'),
      JSON.stringify({ model: 'opus', timeout: 120_000, verbose: true })
    )

    const config = resolve_config(TMP_DIR, {
      model: 'haiku',
      timeout: 60_000
    })

    expect(config.model).toBe('haiku')
    expect(config.timeout).toBe(60_000)
    // config.json value still wins over defaults when CLI doesn't override
    expect(config.verbose).toBe(true)
  })

  it('missing config.json gracefully falls back to defaults', () => {
    // No config.json written — just the empty directory from beforeEach
    rmSync(join(TMP_DIR, OUTPUT_DIR, 'config.json'), { force: true })

    const config = resolve_config(TMP_DIR)

    expect(config.model).toBe('sonnet')
    expect(config.context_budget).toBe(150_000)
    expect(config.timeout).toBe(300_000)
  })

  it('ignores undefined overrides', () => {
    const config = resolve_config(TMP_DIR, {
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

  it('handles malformed config.json gracefully', () => {
    writeFileSync(
      join(TMP_DIR, OUTPUT_DIR, 'config.json'),
      'not valid json {'
    )

    const config = resolve_config(TMP_DIR)

    expect(config.model).toBe('sonnet')
    expect(config.context_budget).toBe(150_000)
  })

  it('handles config.json with non-object content gracefully', () => {
    writeFileSync(
      join(TMP_DIR, OUTPUT_DIR, 'config.json'),
      JSON.stringify([1, 2, 3])
    )

    const config = resolve_config(TMP_DIR)

    expect(config.model).toBe('sonnet')
  })
})
