import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  read_active_learnings,
  read_learnings_log,
  append_learnings,
  get_domain_learnings
} from '../learnings.js'
import type { LearningEntry } from '../../types.js'
import { MAX_CLAUDE_FILE_CHARS } from '../../types.js'

let tmp_dir: string

beforeEach(async () => {
  tmp_dir = await mkdtemp(join(tmpdir(), 'faultline-test-'))
})

afterEach(async () => {
  await rm(tmp_dir, { recursive: true, force: true })
})

const make_entry = (
  overrides: Partial<LearningEntry> = {}
): LearningEntry => ({
  id: 'test_1',
  type: 'observation',
  domain: 'cross-cutting',
  content: 'Test observation',
  source_phase: 'survey',
  created_at: new Date().toISOString(),
  tokens_est: 10,
  ...overrides
})

describe('learnings read/write', () => {
  it('returns empty sets when no files exist', async () => {
    const active = await read_active_learnings(tmp_dir)
    const log = await read_learnings_log(tmp_dir)

    expect(active.entries).toEqual([])
    expect(log.entries).toEqual([])
  })

  it('appends entries to both log and active set', async () => {
    const entry = make_entry()

    await append_learnings(tmp_dir, [entry])

    const active = await read_active_learnings(tmp_dir)
    const log = await read_learnings_log(tmp_dir)

    expect(active.entries.length).toBe(1)
    expect(log.entries.length).toBe(1)
    expect(active.total_tokens).toBe(10)
  })
})

describe('learnings compression', () => {
  it('compresses active set when exceeding token limit', async () => {
    // Create entries that exceed 3000 token limit
    const entries: LearningEntry[] = []

    for (let i = 0; i < 10; i++) {
      entries.push(make_entry({
        id: `entry_${i}`,
        tokens_est: 500,
        type: 'hypothesis'
      }))
    }

    await append_learnings(tmp_dir, entries) // 5000 tokens total

    const active = await read_active_learnings(tmp_dir)

    expect(active.total_tokens).toBeLessThanOrEqual(3000)

    // Full log should still have all entries
    const log = await read_learnings_log(tmp_dir)

    expect(log.entries.length).toBe(10)
  })

  it('preserves contradiction-type entries during compression', async () => {
    const entries: LearningEntry[] = [
      make_entry({ id: 'h1', type: 'hypothesis', tokens_est: 1000 }),
      make_entry({ id: 'h2', type: 'hypothesis', tokens_est: 1000 }),
      make_entry({ id: 'c1', type: 'contradiction', tokens_est: 1000 }),
      make_entry({ id: 'h3', type: 'hypothesis', tokens_est: 1000 })
    ]

    await append_learnings(tmp_dir, entries) // 4000 tokens, needs compression

    const active = await read_active_learnings(tmp_dir)
    const types = active.entries.map(e => e.type)

    // Contradiction should be kept (highest priority)
    expect(types).toContain('contradiction')
  })

  it('drops hypothesis-type entries first', async () => {
    const entries: LearningEntry[] = [
      make_entry({ id: 'o1', type: 'observation', tokens_est: 1000 }),
      make_entry({ id: 'h1', type: 'hypothesis', tokens_est: 1000 }),
      make_entry({ id: 'p1', type: 'pattern', tokens_est: 1000 }),
      make_entry({ id: 'c1', type: 'contradiction', tokens_est: 1000 })
    ]

    await append_learnings(tmp_dir, entries) // 4000 tokens

    const active = await read_active_learnings(tmp_dir)
    const ids = active.entries.map(e => e.id)

    // Hypothesis (lowest priority) should be dropped first
    expect(ids).not.toContain('h1')
    // Contradiction should definitely survive
    expect(ids).toContain('c1')
  })

  it('drops entries when serialized size exceeds char ceiling', async () => {
    // Create entries with small tokens_est but large content, so the
    // token-budget pass keeps them all but serialized JSON exceeds the ceiling.
    const content = 'x'.repeat(2000)
    const entries: LearningEntry[] = []

    for (let i = 0; i < 20; i++) {
      entries.push(make_entry({
        id: `big_${i}`,
        tokens_est: 100, // 20 × 100 = 2000, under 3000 token limit
        content,
        type: 'hypothesis'
      }))
    }

    await append_learnings(tmp_dir, entries)

    const active = await read_active_learnings(tmp_dir)
    const serialized = JSON.stringify(active, null, 2)

    expect(serialized.length).toBeLessThanOrEqual(MAX_CLAUDE_FILE_CHARS)
    expect(active.entries.length).toBeLessThan(20)
  })
})

describe('domain filtering', () => {
  it('filters learnings by domain', async () => {
    const entries = [
      make_entry({ id: 'cc', domain: 'cross-cutting' }),
      make_entry({ id: 'auth', domain: 'auth' }),
      make_entry({ id: 'db', domain: 'database' })
    ]

    await append_learnings(tmp_dir, entries)

    const auth_learnings = await get_domain_learnings(tmp_dir, 'auth')

    // Should get auth + cross-cutting entries
    expect(auth_learnings.length).toBe(2)
    expect(auth_learnings.map(e => e.id).sort()).toEqual(['auth', 'cc'])
  })

  it('always includes cross-cutting entries', async () => {
    const entries = [
      make_entry({ id: 'cc', domain: 'cross-cutting' })
    ]

    await append_learnings(tmp_dir, entries)

    const result = await get_domain_learnings(tmp_dir, 'any-domain')

    expect(result.length).toBe(1)
    expect(result[0].domain).toBe('cross-cutting')
  })
})
