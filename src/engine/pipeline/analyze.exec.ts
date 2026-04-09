import { join } from 'node:path'

import { set_budget_limit, BudgetExceededError } from '../claude/invoke.js'
import { execute_survey } from './survey.exec.js'
import { execute_extract } from './extract.exec.js'
import { execute_reconcile } from './reconcile.exec.js'
import { execute_synthesize } from './synthesize.exec.js'
import {
  read_state,
  write_state,
  init_state,
  is_phase_completed,
  read_budget
} from '../../stores/index.js'
import {
  log_info,
  log_success,
  log_warn,
  log_error,
  log_step
} from '../../ui/index.js'
import type { FaultlineConfig, PipelineState } from '../../types.js'

///////////////////////////////////////////////////////////////// Constants //

const PHASE_SEQUENCE = ['survey', 'extract', 'reconcile', 'synthesize'] as const

///////////////////////////////////////////////////////////////////////// API //

/**
 * Execute Analyze
 *
 * Runs the full pipeline (survey -> extract -> reconcile -> synthesize) with
 * resume support, budget ceiling enforcement, and graceful SIGINT handling.
 * Skips already-completed phases when resuming an interrupted run.
 *
 * @param config - The resolved faultline configuration.
 */
export const execute_analyze = async (config: FaultlineConfig): Promise<void> => {
  const output_dir = join(config.target_dir, config.output_dir)

  let state = await read_state(output_dir)

  if (!state) {
    state = init_state(config.target_dir)
    await write_state(output_dir, state)
  }

  // Set global budget limit for per-invocation checking
  if (config.max_budget_usd > 0) {
    set_budget_limit(config.max_budget_usd)
  }

  // Install SIGINT handler for graceful shutdown
  const cleanup = install_sigint_handler(state, output_dir)

  try {
    for (const phase_name of PHASE_SEQUENCE) {
      // Skip reconcile if --skip-reconcile
      if (phase_name === 'reconcile' && config.skip_reconcile) {
        log_info('Skipping reconciliation (--skip-reconcile)')
        continue
      }

      // Skip already-completed phases (resume support)
      if (is_phase_completed(state, phase_name)) {
        log_info(`Skipping completed phase: ${phase_name}`)
        continue
      }

      log_step(phase_name, `Starting ${phase_name} phase`)

      try {
        await execute_phase(phase_name, config)
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          log_warn(
            `Budget ceiling reached during ${phase_name} phase: ` +
            `$${err.spent.toFixed(4)} spent of $${err.limit.toFixed(2)} limit. ` +
            'Pipeline halted. Re-run to resume after increasing budget.'
          )
          await write_state(output_dir, state)
          return
        }

        throw err
      }

      log_success(`Phase ${phase_name} completed`)
    }

    log_success('Full analysis pipeline completed')

    // Print cost summary
    const budget = await read_budget(output_dir)

    if (budget.entries.length > 0) {
      log_info(`Total cost: $${budget.total_cost.toFixed(4)}`)
    }
  } finally {
    set_budget_limit(0)
    cleanup()
  }
}

///////////////////////////////////////////////////////////////////// Helpers //

/**
 * Executes a single pipeline phase by delegating to the appropriate executor.
 */
const execute_phase = async (
  phase: string,
  config: FaultlineConfig
): Promise<void> => {
  switch (phase) {
    case 'survey':
      await execute_survey(config)
      break
    case 'extract':
      await execute_extract(config)
      break
    case 'reconcile':
      await execute_reconcile(config)
      break
    case 'synthesize':
      await execute_synthesize(config)
      break
    default:
      throw new Error(`Unknown phase: ${phase}`)
  }
}

/**
 * Installs a SIGINT handler that saves pipeline state before exiting.
 * Returns a cleanup function to remove the handler.
 */
const install_sigint_handler = (
  state: PipelineState,
  output_dir: string
): () => void => {
  const handler = async () => {
    log_warn('Interrupted — saving pipeline state...')

    try {
      await write_state(output_dir, state)
      log_info('State saved. Re-run the same command to resume.')
    } catch (err) {
      log_error(`Failed to save state: ${err instanceof Error ? err.message : String(err)}`)
    }

    process.exit(130)
  }

  process.on('SIGINT', handler)

  return () => {
    process.removeListener('SIGINT', handler)
  }
}
