import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

import type { DomainSummary } from '../types.js'

///////////////////////////////////////////////////////////////// Constants //

const SYNTHESIS_DIR = 'synthesis'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Write Domain Summaries
 *
 * Persists the compressed domain summaries used during spec writing.
 *
 * @param output_dir - The .faultline directory path.
 * @param summaries - The domain summaries.
 */
export const write_domain_summaries = async (
  output_dir: string,
  summaries: DomainSummary[]
): Promise<void> => {
  const dir = join(output_dir, SYNTHESIS_DIR)

  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'domain_summaries.json'),
    JSON.stringify(summaries, null, 2),
    'utf-8'
  )
}

/**
 * Read Domain Summaries
 *
 * Reads the domain summaries from disk.
 *
 * @param output_dir - The .faultline directory path.
 * @returns The summaries, or null.
 */
export const read_domain_summaries = async (
  output_dir: string
): Promise<DomainSummary[] | null> => {
  const path = join(output_dir, SYNTHESIS_DIR, 'domain_summaries.json')

  if (!existsSync(path)) {
    return null
  }

  const content = await readFile(path, 'utf-8')

  return JSON.parse(content) as DomainSummary[]
}
