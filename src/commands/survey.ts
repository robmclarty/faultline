import type { Command } from 'commander'

import { resolve_config } from '../stores/config.js'
import { execute_survey } from '../engine/pipeline/survey.exec.js'
import { log_error, set_verbose } from '../ui/index.js'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Register Survey Command
 *
 * Registers the `survey` subcommand with the CLI program.
 *
 * @param program - The commander program instance.
 */
export const register_survey = (program: Command): void => {
  program
    .command('survey')
    .description('Survey a codebase: index files, map domains, plan extraction')
    .argument('<target>', 'Path to the codebase to analyze')
    .option('-m, --model <model>', 'Claude model to use')
    .option('--include <patterns...>', 'Glob patterns to include')
    .option('--exclude <patterns...>', 'Glob patterns to exclude')
    .option('--context-budget <tokens>', 'Token budget per batch', parseInt)
    .option('--timeout <ms>', 'Timeout per Claude invocation (ms)', parseInt)
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (target: string, opts: Record<string, unknown>) => {
      try {
        set_verbose(opts.verbose as boolean ?? false)

        const config = resolve_config(target, {
          model: opts.model as string | undefined,
          survey_model: opts.model as string | undefined,
          include: opts.include as string[] | undefined,
          exclude: opts.exclude as string[] | undefined,
          context_budget: opts.contextBudget as number | undefined,
          timeout: opts.timeout as number | undefined,
          verbose: opts.verbose as boolean | undefined
        })

        await execute_survey(config)
      } catch (err) {
        log_error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}
