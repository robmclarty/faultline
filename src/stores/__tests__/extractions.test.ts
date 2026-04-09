import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  write_batch_notes,
  read_batch_notes,
  write_consolidated_notes,
  read_consolidated_notes,
  write_extraction_review,
  read_extraction_review,
  write_deep_pass_notes,
  read_deep_pass_notes
} from '../extractions.js'
import type { ExtractionReview } from '../../types.js'

let tmp_dir: string

beforeEach(async () => {
  tmp_dir = await mkdtemp(join(tmpdir(), 'faultline-extract-store-'))
})

afterEach(async () => {
  await rm(tmp_dir, { recursive: true, force: true })
})

describe('batch notes', () => {
  it('writes and reads batch notes with zero-padded index', async () => {
    await write_batch_notes(tmp_dir, 'auth', 0, 'batch 0 notes')

    const notes = await read_batch_notes(tmp_dir, 'auth', 0)

    expect(notes).toBe('batch 0 notes')
  })

  it('handles multi-digit batch indices', async () => {
    await write_batch_notes(tmp_dir, 'auth', 12, 'batch 12 notes')

    const notes = await read_batch_notes(tmp_dir, 'auth', 12)

    expect(notes).toBe('batch 12 notes')
  })

  it('returns null for non-existent batch', async () => {
    const notes = await read_batch_notes(tmp_dir, 'auth', 99)

    expect(notes).toBeNull()
  })
})

describe('consolidated notes', () => {
  it('writes and reads consolidated notes', async () => {
    const content = '# Consolidated\n\nSome notes'

    await write_consolidated_notes(tmp_dir, 'auth', content)

    const notes = await read_consolidated_notes(tmp_dir, 'auth')

    expect(notes).toBe(content)
  })

  it('returns null for non-existent domain', async () => {
    const notes = await read_consolidated_notes(tmp_dir, 'nonexistent')

    expect(notes).toBeNull()
  })
})

describe('extraction review', () => {
  it('writes and reads review verdict', async () => {
    const review: ExtractionReview = {
      passed: true,
      issues: [],
      suggestions: ['Consider adding more detail'],
      uncovered_files: []
    }

    await write_extraction_review(tmp_dir, 'auth', review)

    const read = await read_extraction_review(tmp_dir, 'auth')

    expect(read).not.toBeNull()
    expect(read!.passed).toBe(true)
    expect(read!.suggestions).toEqual(['Consider adding more detail'])
  })

  it('writes review with failures', async () => {
    const review: ExtractionReview = {
      passed: false,
      issues: ['Missing file coverage', 'Abstraction violation'],
      suggestions: [],
      uncovered_files: ['src/auth/helper.js']
    }

    await write_extraction_review(tmp_dir, 'auth', review)

    const read = await read_extraction_review(tmp_dir, 'auth')

    expect(read!.passed).toBe(false)
    expect(read!.issues).toHaveLength(2)
    expect(read!.uncovered_files).toEqual(['src/auth/helper.js'])
  })

  it('returns null for non-existent review', async () => {
    const review = await read_extraction_review(tmp_dir, 'nonexistent')

    expect(review).toBeNull()
  })
})

describe('deep pass notes', () => {
  it('writes and reads deep pass notes', async () => {
    const content = '# Deep Pass\n\nAdditional findings'

    await write_deep_pass_notes(tmp_dir, 'auth', content)

    const notes = await read_deep_pass_notes(tmp_dir, 'auth')

    expect(notes).toBe(content)
  })

  it('returns null for non-existent deep pass', async () => {
    const notes = await read_deep_pass_notes(tmp_dir, 'nonexistent')

    expect(notes).toBeNull()
  })
})
