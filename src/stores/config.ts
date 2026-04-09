import { resolve, join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'

import type { FaultlineConfig } from '../types.js'

///////////////////////////////////////////////////////////////// Constants //

const DEFAULT_MODEL = 'sonnet'
const DEFAULT_SURVEY_MODEL = 'sonnet'
const DEFAULT_REVIEW_MODEL = 'sonnet'
const DEFAULT_CONTEXT_BUDGET = 150_000
const DEFAULT_TIMEOUT = 300_000
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_OUTPUT_DIR = '.faultline'
const CONFIG_FILENAME = 'config.json'

/////////////////////////////////////////////////////////////////////// Types //

type ConfigOverrides = Partial<FaultlineConfig>

///////////////////////////////////////////////////////////////////////// API //

/**
 * Resolve Config
 *
 * Merges CLI flags over config.json over defaults to produce the final config.
 * The three-tier resolution order is: defaults → config.json → CLI flags.
 *
 * @param target_dir - The directory being analyzed.
 * @param overrides - CLI flag overrides.
 * @returns Resolved configuration.
 */
export const resolve_config = (
  target_dir: string,
  overrides: ConfigOverrides = {}
): FaultlineConfig => {
  const resolved_target = resolve(target_dir)
  const output_dir = (overrides.output_dir as string) ?? DEFAULT_OUTPUT_DIR

  const defaults: FaultlineConfig = {
    target_dir: resolved_target,
    model: DEFAULT_MODEL,
    survey_model: DEFAULT_SURVEY_MODEL,
    review_model: DEFAULT_REVIEW_MODEL,
    context_budget: DEFAULT_CONTEXT_BUDGET,
    timeout: DEFAULT_TIMEOUT,
    max_retries: DEFAULT_MAX_RETRIES,
    include: [],
    exclude: [],
    output_dir: DEFAULT_OUTPUT_DIR,
    verbose: false
  }

  const file_config = load_config_file(resolved_target, output_dir)

  return {
    ...defaults,
    ...strip_undefined(file_config),
    ...strip_undefined(overrides),
    target_dir: resolved_target
  }
}

///////////////////////////////////////////////////////////////////// Helpers //

/**
 * Loads config.json from the output directory if it exists.
 * Returns an empty object if the file is missing or malformed.
 */
const load_config_file = (
  target_dir: string,
  output_dir: string
): Partial<FaultlineConfig> => {
  const config_path = join(target_dir, output_dir, CONFIG_FILENAME)

  if (!existsSync(config_path)) {
    return {}
  }

  try {
    const raw = readFileSync(config_path, 'utf-8')
    const parsed = JSON.parse(raw)

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {}
    }

    return parsed as Partial<FaultlineConfig>
  } catch {
    return {}
  }
}

/**
 * Strips undefined values from an object so they don't override defaults
 * during spread.
 */
const strip_undefined = (obj: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value
    }
  }

  return result
}
