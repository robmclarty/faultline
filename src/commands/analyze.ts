import type { Command } from 'commander'

import { resolve_config } from '../stores/config.js'
import { execute_analyze } from '../engine/pipeline/analyze.exec.js'
import { log_error, set_verbose } from '../ui/index.js'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Register Analyze Command
 *
 * Registers the `analyze` subcommand. Runs the full pipeline (survey +
 * extract + reconcile + synthesize) with resume support, budget ceiling
 * enforcement, and graceful interruption handling.
 *
 * @param program - The commander program instance.
 */
export const register_analyze = (program: Command): void => {
  program
    .command('analyze')
    .description('Run the full analysis pipeline (survey → extract → reconcile → synthesize)')
    .argument('<target>', 'Path to the codebase to analyze')
    .option('-m, --model <model>', 'Claude model to use')
    .option('--survey-model <model>', 'Model for survey phase')
    .option('--concurrency <n>', 'Max parallel domain extractions', parseInt)
    .option('--max-retries <n>', 'Max retries per Claude invocation', parseInt)
    .option('--max-budget-usd <n>', 'Halt pipeline when cost exceeds this amount', parseFloat)
    .option('--skip-reconcile', 'Skip reconciliation phase')
    .option('--skip-deep-pass', 'Skip deep extraction for high-priority domains')
    .option('--ridgeline <name>', 'Copy output to .ridgeline/builds/<name>/')
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
          survey_model: opts.surveyModel as string | undefined,
          concurrency: opts.concurrency as number | undefined,
          max_retries: opts.maxRetries as number | undefined,
          max_budget_usd: opts.maxBudgetUsd as number | undefined,
          skip_reconcile: opts.skipReconcile as boolean | undefined,
          skip_deep_pass: opts.skipDeepPass as boolean | undefined,
          ridgeline_name: opts.ridgeline as string | undefined,
          include: opts.include as string[] | undefined,
          exclude: opts.exclude as string[] | undefined,
          context_budget: opts.contextBudget as number | undefined,
          timeout: opts.timeout as number | undefined,
          output_dir: opts.output as string | undefined,
          verbose: opts.verbose as boolean | undefined
        })

        await execute_analyze(config)
      } catch (err) {
        log_error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}
