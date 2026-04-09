import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { read_budget, append_budget_entry, create_budget_entry } from '../budget.js'

let tmp_dir: string

beforeEach(async () => {
  tmp_dir = await mkdtemp(join(tmpdir(), 'faultline-test-'))
})

afterEach(async () => {
  await rm(tmp_dir, { recursive: true, force: true })
})

describe('read_budget', () => {
  it('returns empty log when no file exists', async () => {
    const budget = await read_budget(tmp_dir)

    expect(budget.entries).toEqual([])
    expect(budget.total_cost).toBe(0)
  })
})

describe('append_budget_entry', () => {
  it('appends entries and updates total cost', async () => {
    const entry = create_budget_entry('survey', 'classify', 'sonnet', 1000, 500)

    await append_budget_entry(tmp_dir, entry)

    const budget = await read_budget(tmp_dir)

    expect(budget.entries.length).toBe(1)
    expect(budget.entries[0].phase).toBe('survey')
    expect(budget.entries[0].task).toBe('classify')
    expect(budget.total_cost).toBeGreaterThan(0)
  })

  it('accumulates multiple entries', async () => {
    await append_budget_entry(
      tmp_dir,
      create_budget_entry('survey', 'task1', 'sonnet', 100, 50)
    )
    await append_budget_entry(
      tmp_dir,
      create_budget_entry('survey', 'task2', 'sonnet', 200, 100)
    )

    const budget = await read_budget(tmp_dir)

    expect(budget.entries.length).toBe(2)
  })
})

describe('create_budget_entry', () => {
  it('creates entry with timestamp', () => {
    const entry = create_budget_entry('survey', 'test', 'sonnet', 1000, 500)

    expect(entry.timestamp).toBeDefined()
    expect(entry.phase).toBe('survey')
    expect(entry.task).toBe('test')
    expect(entry.model).toBe('sonnet')
    expect(entry.input_tokens).toBe(1000)
    expect(entry.output_tokens).toBe(500)
    expect(entry.estimated_cost).toBeGreaterThan(0)
  })

  it('uses correct pricing for opus', () => {
    const entry = create_budget_entry('survey', 'test', 'opus', 1000, 500)
    // opus: 15 per M input, 75 per M output
    const expected = (1000 / 1_000_000) * 15 + (500 / 1_000_000) * 75

    expect(entry.estimated_cost).toBeCloseTo(expected)
  })
})
