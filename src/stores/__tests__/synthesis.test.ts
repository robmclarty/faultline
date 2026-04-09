import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  write_domain_summaries,
  read_domain_summaries
} from '../synthesis.js'
import type { DomainSummary } from '../../types.js'

let tmp_dir: string
let output_dir: string

beforeEach(async () => {
  tmp_dir = await mkdtemp(join(tmpdir(), 'faultline-synthesis-test-'))
  output_dir = tmp_dir
})

afterEach(async () => {
  await rm(tmp_dir, { recursive: true, force: true })
})

describe('synthesis store', () => {
  it('writes and reads domain summaries', async () => {
    const summaries: DomainSummary[] = [
      {
        domain_id: 'auth',
        label: 'Authentication',
        summary: 'Handles user identity and sessions.',
        tokens_est: 12
      },
      {
        domain_id: 'tasks',
        label: 'Task Management',
        summary: 'Manages task lifecycle.',
        tokens_est: 8
      }
    ]

    await write_domain_summaries(output_dir, summaries)

    const read = await read_domain_summaries(output_dir)

    expect(read).not.toBeNull()
    expect(read!.length).toBe(2)
    expect(read![0].domain_id).toBe('auth')
    expect(read![1].label).toBe('Task Management')
  })

  it('returns null when no summaries exist', async () => {
    const result = await read_domain_summaries(output_dir)

    expect(result).toBeNull()
  })
})
