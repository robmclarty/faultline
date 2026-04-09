import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

import { validate_token_ceiling } from './validation.js'
import type { ExtractionReview } from '../types.js'

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

  validate_token_ceiling(notes, `${domain_id}/batch-${String(batch_index).padStart(2, '0')}.notes.md`)
  await writeFile(join(dir, `batch-${String(batch_index).padStart(2, '0')}.notes.md`), notes, 'utf-8')
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
  const path = join(
    output_dir,
    EXTRACTIONS_DIR,
    domain_id,
    `batch-${String(batch_index).padStart(2, '0')}.notes.md`
  )

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

  validate_token_ceiling(notes, `${domain_id}/consolidated.notes.md`)
  await writeFile(join(dir, 'consolidated.notes.md'), notes, 'utf-8')
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
  const path = join(output_dir, EXTRACTIONS_DIR, domain_id, 'consolidated.notes.md')

  if (!existsSync(path)) {
    return null
  }

  return readFile(path, 'utf-8')
}

/**
 * Write Extraction Review
 *
 * Persists the extraction review verdict for a domain.
 *
 * @param output_dir - The .faultline directory path.
 * @param domain_id - The domain identifier.
 * @param review - The review verdict.
 */
export const write_extraction_review = async (
  output_dir: string,
  domain_id: string,
  review: ExtractionReview
): Promise<void> => {
  const dir = join(output_dir, EXTRACTIONS_DIR, domain_id)

  await mkdir(dir, { recursive: true })

  await writeFile(join(dir, 'review.json'), JSON.stringify(review, null, 2), 'utf-8')
}

/**
 * Read Extraction Review
 *
 * Reads the extraction review verdict for a domain.
 *
 * @param output_dir - The .faultline directory path.
 * @param domain_id - The domain identifier.
 * @returns The review, or null.
 */
export const read_extraction_review = async (
  output_dir: string,
  domain_id: string
): Promise<ExtractionReview | null> => {
  const path = join(output_dir, EXTRACTIONS_DIR, domain_id, 'review.json')

  if (!existsSync(path)) {
    return null
  }

  const content = await readFile(path, 'utf-8')

  return JSON.parse(content) as ExtractionReview
}

/**
 * Write Deep Pass Notes
 *
 * Persists the deep extraction pass notes for a domain.
 *
 * @param output_dir - The .faultline directory path.
 * @param domain_id - The domain identifier.
 * @param notes - The deep pass notes content.
 */
export const write_deep_pass_notes = async (
  output_dir: string,
  domain_id: string,
  notes: string
): Promise<void> => {
  const dir = join(output_dir, EXTRACTIONS_DIR, domain_id)

  await mkdir(dir, { recursive: true })

  validate_token_ceiling(notes, `${domain_id}/deep_pass.notes.md`)
  await writeFile(join(dir, 'deep_pass.notes.md'), notes, 'utf-8')
}

/**
 * Read Deep Pass Notes
 *
 * Reads the deep pass notes for a domain.
 *
 * @param output_dir - The .faultline directory path.
 * @param domain_id - The domain identifier.
 * @returns The deep pass notes, or null.
 */
export const read_deep_pass_notes = async (
  output_dir: string,
  domain_id: string
): Promise<string | null> => {
  const path = join(output_dir, EXTRACTIONS_DIR, domain_id, 'deep_pass.notes.md')

  if (!existsSync(path)) {
    return null
  }

  return readFile(path, 'utf-8')
}
