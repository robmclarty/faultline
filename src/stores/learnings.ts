import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

import type { LearningEntry, LearningsActive, LearningsLog } from '../types.js'
import { MAX_CLAUDE_FILE_CHARS } from '../types.js'

///////////////////////////////////////////////////////////////// Constants //

const LEARNINGS_FILE = 'learnings.json'
const LEARNINGS_LOG_FILE = 'learnings.log.json'
const ACTIVE_TOKEN_LIMIT = 3_000

/**
 * Retention priority for compression — entries are dropped in this order
 * (lowest priority first). Contradictions are kept longest since they
 * represent important corrections to earlier understanding.
 */
const RETENTION_PRIORITY: Record<string, number> = {
  hypothesis: 1,
  observation: 2,
  pattern: 3,
  contradiction: 4
}

////////////////////////////////////////////////////////////////// Write Queue //

/**
 * Serializes concurrent append_learnings calls to prevent read-modify-write
 * races on the shared learnings.json file.
 */
let _write_queue: Promise<void> = Promise.resolve()

/**
 * Resets the write queue. Exported for test isolation only.
 */
export const _reset_write_queue = (): void => {
  _write_queue = Promise.resolve()
}

///////////////////////////////////////////////////////////////////////// API //

/**
 * Read Active Learnings
 *
 * Reads the bounded active learnings set from disk.
 *
 * @param output_dir - The .faultline directory path.
 * @returns The active learnings, or empty set.
 */
export const read_active_learnings = async (
  output_dir: string
): Promise<LearningsActive> => {
  const path = join(output_dir, LEARNINGS_FILE)

  if (!existsSync(path)) {
    return { entries: [], total_tokens: 0 }
  }

  const content = await readFile(path, 'utf-8')

  return JSON.parse(content) as LearningsActive
}

/**
 * Read Learnings Log
 *
 * Reads the append-only full learnings log.
 *
 * @param output_dir - The .faultline directory path.
 * @returns The full learnings log.
 */
export const read_learnings_log = async (
  output_dir: string
): Promise<LearningsLog> => {
  const path = join(output_dir, LEARNINGS_LOG_FILE)

  if (!existsSync(path)) {
    return { entries: [] }
  }

  const content = await readFile(path, 'utf-8')

  return JSON.parse(content) as LearningsLog
}

/**
 * Append Learnings
 *
 * Adds new entries to both the full log and the active set. If the active set
 * exceeds the token limit, it's compressed by dropping lowest-priority entries.
 *
 * @param output_dir - The .faultline directory path.
 * @param entries - New entries to add.
 */
export const append_learnings = async (
  output_dir: string,
  entries: LearningEntry[]
): Promise<void> => {
  const operation = _write_queue.then(async () => {
    await mkdir(output_dir, { recursive: true })

    // Append to full log
    const log = await read_learnings_log(output_dir)

    log.entries.push(...entries)
    await writeFile(
      join(output_dir, LEARNINGS_LOG_FILE),
      JSON.stringify(log, null, 2),
      'utf-8'
    )

    // Update active set with compression
    const active = await read_active_learnings(output_dir)

    active.entries.push(...entries)
    active.total_tokens = active.entries.reduce((sum, e) => sum + e.tokens_est, 0)

    const { serialized } = compress_active_set(active)

    await writeFile(
      join(output_dir, LEARNINGS_FILE),
      serialized,
      'utf-8'
    )
  })

  // Swallow errors so the next queued caller isn't blocked by a prior failure
  _write_queue = operation.catch(() => {})

  return operation
}

/**
 * Get Domain Learnings
 *
 * Filters active learnings by domain.
 *
 * @param output_dir - The .faultline directory path.
 * @param domain - The domain to filter by.
 * @returns Filtered learnings.
 */
export const get_domain_learnings = async (
  output_dir: string,
  domain: string
): Promise<LearningEntry[]> => {
  const active = await read_active_learnings(output_dir)

  return active.entries.filter(
    e => e.domain === domain || e.domain === 'cross-cutting'
  )
}

///////////////////////////////////////////////////////////////////// Helpers //

/**
 * Compresses the active set when it exceeds the token limit. Drops entries
 * by retention priority (hypothesis first, contradiction last) until under
 * the limit. Returns both the data and its serialized form to avoid
 * re-serialization divergence.
 */
const compress_active_set = (
  active: LearningsActive
): { data: LearningsActive, serialized: string } => {
  let result: LearningsActive

  if (active.total_tokens <= ACTIVE_TOKEN_LIMIT) {
    result = active
  } else {
    // Sort by retention priority ascending (lowest dropped first)
    const sorted = [...active.entries].sort((a, b) => {
      const prio_a = RETENTION_PRIORITY[a.type] ?? 2
      const prio_b = RETENTION_PRIORITY[b.type] ?? 2

      if (prio_a !== prio_b) {
        return prio_a - prio_b
      }

      // Within same priority, drop older first
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })

    const kept: LearningEntry[] = []
    let total_tokens = 0

    // Walk from highest priority to lowest, keeping entries until budget met
    for (const entry of sorted.reverse()) {
      if (total_tokens + entry.tokens_est <= ACTIVE_TOKEN_LIMIT) {
        kept.unshift(entry)
        total_tokens += entry.tokens_est
      }
    }

    result = { entries: kept, total_tokens }
  }

  // Secondary pass: drop entries if serialized size exceeds char ceiling.
  // tokens_est only covers content, not JSON structural overhead per entry.
  let serialized = JSON.stringify(result, null, 2)

  while (result.entries.length > 0 && serialized.length > MAX_CLAUDE_FILE_CHARS) {
    const indexed = result.entries.map((e, i) => ({ e, i }))

    indexed.sort((a, b) => {
      const prio_a = RETENTION_PRIORITY[a.e.type] ?? 2
      const prio_b = RETENTION_PRIORITY[b.e.type] ?? 2

      if (prio_a !== prio_b) return prio_a - prio_b

      return new Date(a.e.created_at).getTime() - new Date(b.e.created_at).getTime()
    })

    const drop_idx = indexed[0].i

    result.entries.splice(drop_idx, 1)
    result.total_tokens = result.entries.reduce((sum, e) => sum + e.tokens_est, 0)
    serialized = JSON.stringify(result, null, 2)
  }

  return { data: result, serialized }
}
