import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'

import { walk_files, generate_tree } from '../file_walker.js'
import { should_exclude, matches_any, matches_glob } from '../file_walker.js'

const FIXTURE_DIR = resolve(import.meta.dirname, '../../../test/fixtures/sample-app')

describe('matches_glob', () => {
  it('matches directory patterns with /**', () => {
    expect(matches_glob('node_modules/foo/bar.js', 'node_modules/**', false)).toBe(true)
    expect(matches_glob('src/index.ts', 'node_modules/**', false)).toBe(false)
  })

  it('matches the directory itself with /**', () => {
    expect(matches_glob('node_modules', 'node_modules/**', true)).toBe(true)
  })

  it('matches extension patterns with *.*', () => {
    expect(matches_glob('src/file.lock', '*.lock', false)).toBe(true)
    expect(matches_glob('src/file.ts', '*.lock', false)).toBe(false)
  })

  it('matches exact filenames', () => {
    expect(matches_glob('package-lock.json', 'package-lock.json', false)).toBe(true)
    expect(matches_glob('src/package-lock.json', 'package-lock.json', false)).toBe(true)
  })
})

describe('should_exclude', () => {
  it('excludes node_modules', () => {
    expect(should_exclude('node_modules', true, ['node_modules/**'])).toBe(true)
    expect(should_exclude('node_modules/foo.js', false, ['node_modules/**'])).toBe(true)
  })

  it('does not exclude non-matching paths', () => {
    expect(should_exclude('src/index.ts', false, ['node_modules/**'])).toBe(false)
  })
})

describe('matches_any', () => {
  it('matches when any pattern matches', () => {
    expect(matches_any('src/foo.ts', ['*.ts', '*.js'])).toBe(true)
    expect(matches_any('src/foo.py', ['*.ts', '*.js'])).toBe(false)
  })

  it('returns false for empty patterns', () => {
    expect(matches_any('src/foo.ts', [])).toBe(false)
  })
})

describe('walk_files', () => {
  it('walks a fixture directory and returns file entries', async () => {
    const entries = await walk_files(FIXTURE_DIR)

    expect(entries.length).toBeGreaterThan(5)
    expect(entries.every(e => e.path && e.size_bytes >= 0)).toBe(true)
  })

  it('populates all required fields', async () => {
    const entries = await walk_files(FIXTURE_DIR)
    const first = entries[0]

    expect(first).toHaveProperty('path')
    expect(first).toHaveProperty('size_bytes')
    expect(first).toHaveProperty('tokens_est')
    expect(first).toHaveProperty('extension')
    expect(first).toHaveProperty('language')
    expect(first).toHaveProperty('category')
  })

  it('excludes node_modules by default', async () => {
    const entries = await walk_files(FIXTURE_DIR)

    expect(entries.some(e => e.path.includes('node_modules'))).toBe(false)
  })

  it('respects custom exclude patterns', async () => {
    const entries = await walk_files(FIXTURE_DIR, [], ['docs/**'])

    expect(entries.some(e => e.path.startsWith('docs/'))).toBe(false)
  })

  it('respects include patterns', async () => {
    const entries = await walk_files(FIXTURE_DIR, ['*.js'])

    expect(entries.every(e => e.extension === '.js')).toBe(true)
  })

  it('sorts entries by path', async () => {
    const entries = await walk_files(FIXTURE_DIR)
    const paths = entries.map(e => e.path)
    const sorted = [...paths].sort()

    expect(paths).toEqual(sorted)
  })
})

describe('generate_tree', () => {
  it('generates a tree from file entries', async () => {
    const entries = await walk_files(FIXTURE_DIR)
    const tree = generate_tree(entries)

    expect(tree).toContain('src/')
    expect(tree.length).toBeGreaterThan(0)
  })
})
