import { join, resolve } from 'node:path'

import type { Command } from 'commander'

import {
  read_domains,
  read_extraction_plan,
  is_phase_completed,
  read_state
} from '../stores/index.js'
import { resolve_config } from '../stores/config.js'
import { execute_survey } from '../engine/pipeline/survey.exec.js'
import {
  format_dry_run,
  log_info,
  log_error,
  set_verbose
} from '../ui/index.js'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Register Dry Run Command
 *
 * Registers the `dry-run` subcommand. Shows the extraction plan with per-domain
 * task count, batch count, estimated token usage, estimated Claude invocations,
 * and projected total cost — without invoking Claude for extraction or synthesis.
 * If survey has not been run, it runs the survey first.
 *
 * @param program - The commander program instance.
 */
export const register_dry_run = (program: Command): void => {
  program
    .command('dry-run')
    .description('Preview what the pipeline would do without running Claude')
    .argument('<target>', 'Path to the codebase')
    .option('-m, --model <model>', 'Claude model to use')
    .option('--include <patterns...>', 'Glob patterns to include')
    .option('--exclude <patterns...>', 'Glob patterns to exclude')
    .option('--context-budget <tokens>', 'Token budget per batch', parseInt)
    .option('--timeout <ms>', 'Timeout per Claude invocation (ms)', parseInt)
    .option('-o, --output <dir>', 'Output directory name', '.faultline')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (target: string, opts: Record<string, unknown>) => {
      try {
        set_verbose(opts.verbose as boolean ?? false)

        const config = resolve_config(target, {
          model: opts.model as string | undefined,
          include: opts.include as string[] | undefined,
          exclude: opts.exclude as string[] | undefined,
          context_budget: opts.contextBudget as number | undefined,
          timeout: opts.timeout as number | undefined,
          output_dir: opts.output as string | undefined,
          verbose: opts.verbose as boolean | undefined
        })

        const target_dir = resolve(target)
        const output_dir = join(target_dir, config.output_dir)

        // Check if survey has been run; run it first if needed
        const state = await read_state(output_dir)

        if (!state || !is_phase_completed(state, 'survey')) {
          log_info('Survey not yet completed — running survey first...')
          await execute_survey(config)
        }

        // Load survey artifacts
        const domains = await read_domains(output_dir)
        const plan = await read_extraction_plan(output_dir)

        if (!domains || !plan) {
          log_error('Survey artifacts missing. Run `faultline survey` first.')
          process.exit(1)
        }

        console.log()
        console.log(format_dry_run(plan, domains))
        console.log()
      } catch (err) {
        log_error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}
