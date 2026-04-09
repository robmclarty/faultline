import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

import type { CrossReferenceReport } from '../types.js'

///////////////////////////////////////////////////////////////// Constants //

const EXTRACTIONS_DIR = 'extractions'
const CROSS_REFERENCES_FILE = 'cross_references.json'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Write Cross References
 *
 * Persists the reconciliation cross-reference report.
 *
 * @param output_dir - The .faultline directory path.
 * @param report - The cross-reference report.
 */
export const write_cross_references = async (
  output_dir: string,
  report: CrossReferenceReport
): Promise<void> => {
  const dir = join(output_dir, EXTRACTIONS_DIR)

  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, CROSS_REFERENCES_FILE),
    JSON.stringify(report, null, 2),
    'utf-8'
  )
}

/**
 * Read Cross References
 *
 * Reads the reconciliation cross-reference report from disk.
 *
 * @param output_dir - The .faultline directory path.
 * @returns The report, or null if not found.
 */
export const read_cross_references = async (
  output_dir: string
): Promise<CrossReferenceReport | null> => {
  const path = join(output_dir, EXTRACTIONS_DIR, CROSS_REFERENCES_FILE)

  if (!existsSync(path)) {
    return null
  }

  const content = await readFile(path, 'utf-8')

  return JSON.parse(content) as CrossReferenceReport
}
