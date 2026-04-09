import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

import { validate_token_ceiling } from './validation.js'
import type {
  FileIndex,
  Domain,
  DomainReview,
  ExtractionPlan,
  Manifest
} from '../types.js'

///////////////////////////////////////////////////////////////// Constants //

const SURVEY_DIR = 'survey'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Write File Index
 *
 * Persists the file index to survey/file_index.json.
 *
 * @param output_dir - The .faultline directory path.
 * @param index - The file index to write.
 */
export const write_file_index = async (
  output_dir: string,
  index: FileIndex
): Promise<void> => {
  const dir = join(output_dir, SURVEY_DIR)

  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'file_index.json'), JSON.stringify(index, null, 2), 'utf-8')
}

/**
 * Read File Index
 *
 * Reads the file index from disk.
 *
 * @param output_dir - The .faultline directory path.
 * @returns The file index, or null if not found.
 */
export const read_file_index = async (output_dir: string): Promise<FileIndex | null> => {
  const path = join(output_dir, SURVEY_DIR, 'file_index.json')

  if (!existsSync(path)) {
    return null
  }

  const content = await readFile(path, 'utf-8')

  return JSON.parse(content) as FileIndex
}

/**
 * Write Manifest
 *
 * Persists the parsed dependency manifest.
 *
 * @param output_dir - The .faultline directory path.
 * @param manifest - The manifest data.
 */
export const write_manifest = async (
  output_dir: string,
  manifest: Manifest
): Promise<void> => {
  const dir = join(output_dir, SURVEY_DIR)

  await mkdir(dir, { recursive: true })

  const content = JSON.stringify(manifest, null, 2)

  validate_token_ceiling(content, 'manifest.json')
  await writeFile(join(dir, 'manifest.json'), content, 'utf-8')
}

/**
 * Read Manifest
 *
 * Reads the dependency manifest from disk.
 *
 * @param output_dir - The .faultline directory path.
 * @returns The manifest, or null.
 */
export const read_manifest = async (output_dir: string): Promise<Manifest | null> => {
  const path = join(output_dir, SURVEY_DIR, 'manifest.json')

  if (!existsSync(path)) {
    return null
  }

  const content = await readFile(path, 'utf-8')

  return JSON.parse(content) as Manifest
}

/**
 * Write Tree
 *
 * Persists the directory tree listing.
 *
 * @param output_dir - The .faultline directory path.
 * @param tree - The tree text content.
 */
export const write_tree = async (output_dir: string, tree: string): Promise<void> => {
  const dir = join(output_dir, SURVEY_DIR)

  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'tree.txt'), tree, 'utf-8')
}

/**
 * Write Domains
 *
 * Persists the domain classification results.
 *
 * @param output_dir - The .faultline directory path.
 * @param domains - The domain entries.
 */
export const write_domains = async (
  output_dir: string,
  domains: Domain[]
): Promise<void> => {
  const dir = join(output_dir, SURVEY_DIR)

  await mkdir(dir, { recursive: true })

  const content = JSON.stringify(domains, null, 2)

  validate_token_ceiling(content, 'domains.json')
  await writeFile(join(dir, 'domains.json'), content, 'utf-8')
}

/**
 * Read Domains
 *
 * Reads domain classifications from disk.
 *
 * @param output_dir - The .faultline directory path.
 * @returns The domains, or null.
 */
export const read_domains = async (output_dir: string): Promise<Domain[] | null> => {
  const path = join(output_dir, SURVEY_DIR, 'domains.json')

  if (!existsSync(path)) {
    return null
  }

  const content = await readFile(path, 'utf-8')

  return JSON.parse(content) as Domain[]
}

/**
 * Write Domain Review
 *
 * Persists the adversarial domain review results.
 *
 * @param output_dir - The .faultline directory path.
 * @param review - The review results.
 */
export const write_domain_review = async (
  output_dir: string,
  review: DomainReview
): Promise<void> => {
  const dir = join(output_dir, SURVEY_DIR)

  await mkdir(dir, { recursive: true })

  const content = JSON.stringify(review, null, 2)

  validate_token_ceiling(content, 'domain_review.json')
  await writeFile(join(dir, 'domain_review.json'), content, 'utf-8')
}

/**
 * Write Extraction Plan
 *
 * Persists the extraction plan with batched tasks.
 *
 * @param output_dir - The .faultline directory path.
 * @param plan - The extraction plan.
 */
export const write_extraction_plan = async (
  output_dir: string,
  plan: ExtractionPlan
): Promise<void> => {
  const dir = join(output_dir, SURVEY_DIR)

  await mkdir(dir, { recursive: true })

  const content = JSON.stringify(plan, null, 2)

  validate_token_ceiling(content, 'extraction_plan.json')
  await writeFile(join(dir, 'extraction_plan.json'), content, 'utf-8')
}

/**
 * Read Extraction Plan
 *
 * Reads the extraction plan from disk.
 *
 * @param output_dir - The .faultline directory path.
 * @returns The extraction plan, or null.
 */
export const read_extraction_plan = async (
  output_dir: string
): Promise<ExtractionPlan | null> => {
  const path = join(output_dir, SURVEY_DIR, 'extraction_plan.json')

  if (!existsSync(path)) {
    return null
  }

  const content = await readFile(path, 'utf-8')

  return JSON.parse(content) as ExtractionPlan
}

/**
 * Read Architecture
 *
 * Reads the architecture description markdown from disk.
 *
 * @param output_dir - The .faultline directory path.
 * @returns The architecture markdown, or null.
 */
export const read_architecture = async (
  output_dir: string
): Promise<string | null> => {
  const path = join(output_dir, SURVEY_DIR, 'architecture.md')

  if (!existsSync(path)) {
    return null
  }

  return readFile(path, 'utf-8')
}

/**
 * Write Architecture
 *
 * Persists the architecture description markdown.
 *
 * @param output_dir - The .faultline directory path.
 * @param content - The architecture markdown content.
 */
export const write_architecture = async (
  output_dir: string,
  content: string
): Promise<void> => {
  const dir = join(output_dir, SURVEY_DIR)

  await mkdir(dir, { recursive: true })

  validate_token_ceiling(content, 'architecture.md')
  await writeFile(join(dir, 'architecture.md'), content, 'utf-8')
}
