import { resolve } from 'node:path'

import type { FaultlineConfig } from '../types.js'

///////////////////////////////////////////////////////////////// Constants //

const DEFAULT_MODEL = 'sonnet'
const DEFAULT_SURVEY_MODEL = 'sonnet'
const DEFAULT_REVIEW_MODEL = 'sonnet'
const DEFAULT_CONTEXT_BUDGET = 150_000
const DEFAULT_TIMEOUT = 300_000
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_OUTPUT_DIR = '.faultline'

/////////////////////////////////////////////////////////////////////// Types //

type ConfigOverrides = Partial<FaultlineConfig>

///////////////////////////////////////////////////////////////////////// API //

/**
 * Resolve Config
 *
 * Merges CLI flags over config.json over defaults to produce the final config.
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

  return {
    ...defaults,
    ...strip_undefined(overrides),
    target_dir: resolved_target
  }
}

///////////////////////////////////////////////////////////////////// Helpers //

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
