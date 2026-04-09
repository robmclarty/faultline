import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

import { validate_token_ceiling } from './validation.js'

///////////////////////////////////////////////////////////////// Constants //

const EXTRACTIONS_DIR = 'extractions'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Write Batch Notes
 *
 * Persists extraction notes for a single batch.
 *
 * @param output_dir - The .faultline directory path.
 * @param domain_id - The domain identifier.
 * @param batch_index - The batch index within the domain.
 * @param notes - The extracted notes content.
 */
export const write_batch_notes = async (
  output_dir: string,
  domain_id: string,
  batch_index: number,
  notes: string
): Promise<void> => {
  const dir = join(output_dir, EXTRACTIONS_DIR, domain_id)

  await mkdir(dir, { recursive: true })

  validate_token_ceiling(notes, `${domain_id}/batch_${batch_index}.md`)
  await writeFile(join(dir, `batch_${batch_index}.md`), notes, 'utf-8')
}

/**
 * Read Batch Notes
 *
 * Reads extraction notes for a specific batch.
 *
 * @param output_dir - The .faultline directory path.
 * @param domain_id - The domain identifier.
 * @param batch_index - The batch index.
 * @returns The notes content, or null.
 */
export const read_batch_notes = async (
  output_dir: string,
  domain_id: string,
  batch_index: number
): Promise<string | null> => {
  const path = join(output_dir, EXTRACTIONS_DIR, domain_id, `batch_${batch_index}.md`)

  if (!existsSync(path)) {
    return null
  }

  return readFile(path, 'utf-8')
}

/**
 * Write Consolidated Notes
 *
 * Persists the consolidated notes for a domain.
 *
 * @param output_dir - The .faultline directory path.
 * @param domain_id - The domain identifier.
 * @param notes - The consolidated notes content.
 */
export const write_consolidated_notes = async (
  output_dir: string,
  domain_id: string,
  notes: string
): Promise<void> => {
  const dir = join(output_dir, EXTRACTIONS_DIR, domain_id)

  await mkdir(dir, { recursive: true })

  validate_token_ceiling(notes, `${domain_id}/consolidated.md`)
  await writeFile(join(dir, 'consolidated.md'), notes, 'utf-8')
}

/**
 * Read Consolidated Notes
 *
 * Reads the consolidated notes for a domain.
 *
 * @param output_dir - The .faultline directory path.
 * @param domain_id - The domain identifier.
 * @returns The consolidated notes, or null.
 */
export const read_consolidated_notes = async (
  output_dir: string,
  domain_id: string
): Promise<string | null> => {
  const path = join(output_dir, EXTRACTIONS_DIR, domain_id, 'consolidated.md')

  if (!existsSync(path)) {
    return null
  }

  return readFile(path, 'utf-8')
}
