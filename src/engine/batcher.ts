import type { FileEntry, ExtractionTask, Domain } from '../types.js'

///////////////////////////////////////////////////////////////// Constants //

const LAYER_ORDER = ['models', 'types', 'routes', 'controllers', 'services', 'tests'] as const

const OVERSIZED_THRESHOLD = 80_000

///////////////////////////////////////////////////////////////////////// API //

/**
 * Pack Batches
 *
 * Packs file entries into token-budgeted batches using a greedy bin-packing
 * approach. Each batch stays within the specified token budget.
 *
 * @param items - Items with path and tokens_est fields.
 * @param budget - Maximum tokens per batch.
 * @returns Array of batches, each containing an array of items.
 */
export const pack_batches = <T extends { path: string, tokens_est: number }>(
  items: T[],
  budget: number
): T[][] => {
  if (items.length === 0) {
    return []
  }

  const batches: T[][] = []
  let current_batch: T[] = []
  let current_tokens = 0

  for (const item of items) {
    // If single item exceeds budget, it gets its own batch
    if (item.tokens_est > budget) {
      if (current_batch.length > 0) {
        batches.push(current_batch)
        current_batch = []
        current_tokens = 0
      }

      batches.push([item])
      continue
    }

    if (current_tokens + item.tokens_est > budget) {
      batches.push(current_batch)
      current_batch = [item]
      current_tokens = item.tokens_est
    } else {
      current_batch.push(item)
      current_tokens += item.tokens_est
    }
  }

  if (current_batch.length > 0) {
    batches.push(current_batch)
  }

  return batches
}

/**
 * Build Extraction Tasks
 *
 * Creates extraction tasks from domains, splitting oversized domains by
 * layer (models/types first, routes/controllers second, services third,
 * tests fourth).
 *
 * @param domains - The domain classifications.
 * @param file_index - The full file index.
 * @param context_budget - Token budget per batch.
 * @returns Extraction tasks.
 */
export const build_extraction_tasks = (
  domains: Domain[],
  file_index: FileEntry[],
  context_budget: number
): ExtractionTask[] => {
  const tasks: ExtractionTask[] = []
  const file_map = new Map(file_index.map(f => [f.path, f]))

  for (const domain of domains) {
    const domain_files = get_domain_files(domain, file_map)
    const total_tokens = domain_files.reduce((sum, f) => sum + f.tokens_est, 0)

    if (total_tokens > OVERSIZED_THRESHOLD) {
      // Split by layer
      const layered = split_by_layer(domain_files)

      for (const { layer, files } of layered) {
        const batches = pack_batches(files, context_budget)

        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i]

          tasks.push({
            domain_id: domain.id,
            batch_index: tasks.filter(t => t.domain_id === domain.id).length,
            files: batch.map(f => f.path),
            estimated_tokens: batch.reduce((sum, f) => sum + f.tokens_est, 0),
            layer
          })
        }
      }
    } else {
      const batches = pack_batches(domain_files, context_budget)

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]

        tasks.push({
          domain_id: domain.id,
          batch_index: i,
          files: batch.map(f => f.path),
          estimated_tokens: batch.reduce((sum, f) => sum + f.tokens_est, 0)
        })
      }
    }
  }

  return tasks
}

///////////////////////////////////////////////////////////////////// Helpers //

/**
 * Collects all files belonging to a domain (from directories and key_files).
 */
const get_domain_files = (
  domain: Domain,
  file_map: Map<string, FileEntry>
): FileEntry[] => {
  const files: FileEntry[] = []
  const seen = new Set<string>()

  for (const [path, entry] of file_map) {
    const belongs = domain.directories.some(d => path.startsWith(d + '/') || path === d) ||
      domain.key_files.includes(path)

    if (belongs && !seen.has(path)) {
      seen.add(path)
      files.push(entry)
    }
  }

  return files
}

/**
 * Splits files into layers for oversized domains. Assigns files to layers
 * based on path patterns, with unmatched files going to the closest layer.
 */
const split_by_layer = (
  files: FileEntry[]
): Array<{ layer: string, files: FileEntry[] }> => {
  const layers: Record<string, FileEntry[]> = {
    models: [],
    types: [],
    routes: [],
    controllers: [],
    services: [],
    tests: [],
    other: []
  }

  for (const file of files) {
    const lower = file.path.toLowerCase()

    if (file.category === 'test') {
      layers.tests.push(file)
    } else if (lower.includes('model') || lower.includes('schema') || lower.includes('entity')) {
      layers.models.push(file)
    } else if (lower.includes('type') || lower.includes('interface')) {
      layers.types.push(file)
    } else if (lower.includes('route') || lower.includes('endpoint') || lower.includes('api')) {
      layers.routes.push(file)
    } else if (lower.includes('controller') || lower.includes('handler')) {
      layers.controllers.push(file)
    } else if (lower.includes('service') || lower.includes('provider') || lower.includes('util')) {
      layers.services.push(file)
    } else {
      layers.other.push(file)
    }
  }

  // Merge 'other' into services (closest conceptual layer)
  layers.services.push(...layers.other)
  delete layers.other

  return LAYER_ORDER
    .filter(layer => (layers[layer]?.length ?? 0) > 0)
    .map(layer => ({ layer, files: layers[layer] }))
}
