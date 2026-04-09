import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  write_cross_references,
  read_cross_references
} from '../reconciliation.js'
import type { CrossReferenceReport } from '../../types.js'

let tmp_dir: string
let output_dir: string

beforeEach(async () => {
  tmp_dir = await mkdtemp(join(tmpdir(), 'faultline-reconciliation-test-'))
  output_dir = tmp_dir
})

afterEach(async () => {
  await rm(tmp_dir, { recursive: true, force: true })
})

describe('reconciliation store', () => {
  it('writes and reads cross references', async () => {
    const report: CrossReferenceReport = {
      clusters: [{
        domains: ['auth', 'tasks'],
        findings: [{
          type: 'shared_invariant',
          description: 'All entities use UUID identifiers',
          affected_domains: ['auth', 'tasks'],
          resolution_hint: 'Document in overview'
        }]
      }],
      total_findings: 1,
      generated_at: new Date().toISOString()
    }

    await write_cross_references(output_dir, report)

    const read = await read_cross_references(output_dir)

    expect(read).not.toBeNull()
    expect(read!.clusters.length).toBe(1)
    expect(read!.total_findings).toBe(1)
    expect(read!.clusters[0].findings[0].type).toBe('shared_invariant')
  })

  it('returns null when no cross references exist', async () => {
    const result = await read_cross_references(output_dir)

    expect(result).toBeNull()
  })
})
