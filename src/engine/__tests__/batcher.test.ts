import { describe, it, expect } from 'vitest'

import { pack_batches, build_extraction_tasks } from '../batcher.js'
import type { FileEntry, Domain } from '../../types.js'

describe('pack_batches', () => {
  it('returns empty array for empty input', () => {
    expect(pack_batches([], 100)).toEqual([])
  })

  it('packs items greedily within budget', () => {
    const items = [
      { path: 'a.ts', tokens_est: 30 },
      { path: 'b.ts', tokens_est: 40 },
      { path: 'c.ts', tokens_est: 50 },
      { path: 'd.ts', tokens_est: 20 }
    ]

    const batches = pack_batches(items, 80)

    // a(30) + b(40) = 70 fits, c(50) doesn't fit with them
    expect(batches.length).toBe(2)
    expect(batches[0].map(i => i.path)).toEqual(['a.ts', 'b.ts'])
    expect(batches[1].map(i => i.path)).toEqual(['c.ts', 'd.ts'])
  })

  it('puts oversized items in their own batch', () => {
    const items = [
      { path: 'small.ts', tokens_est: 10 },
      { path: 'huge.ts', tokens_est: 200 },
      { path: 'tiny.ts', tokens_est: 5 }
    ]

    const batches = pack_batches(items, 50)

    expect(batches.length).toBe(3)
    expect(batches[0].map(i => i.path)).toEqual(['small.ts'])
    expect(batches[1].map(i => i.path)).toEqual(['huge.ts'])
    expect(batches[2].map(i => i.path)).toEqual(['tiny.ts'])
  })

  it('handles single item', () => {
    const items = [{ path: 'a.ts', tokens_est: 10 }]

    expect(pack_batches(items, 100)).toEqual([[items[0]]])
  })

  it('handles all items fitting in one batch', () => {
    const items = [
      { path: 'a.ts', tokens_est: 10 },
      { path: 'b.ts', tokens_est: 20 },
      { path: 'c.ts', tokens_est: 30 }
    ]

    const batches = pack_batches(items, 100)

    expect(batches.length).toBe(1)
    expect(batches[0].length).toBe(3)
  })
})

describe('build_extraction_tasks', () => {
  it('creates tasks from domains', () => {
    const domains: Domain[] = [{
      id: 'core',
      label: 'Core',
      description: 'Core logic',
      directories: ['src'],
      key_files: [],
      estimated_tokens: 100,
      priority: 1,
      depends_on: [],
      sub_domains: []
    }]

    const files: FileEntry[] = [
      {
        path: 'src/index.ts',
        size_bytes: 100,
        tokens_est: 25,
        extension: '.ts',
        language: 'typescript',
        category: 'source'
      },
      {
        path: 'src/util.ts',
        size_bytes: 200,
        tokens_est: 50,
        extension: '.ts',
        language: 'typescript',
        category: 'source'
      }
    ]

    const tasks = build_extraction_tasks(domains, files, 100)

    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks[0].domain_id).toBe('core')
    expect(tasks[0].files.length).toBe(2)
  })
})
