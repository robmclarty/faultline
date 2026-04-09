import type { Command } from 'commander'

import { resolve_config } from '../stores/config.js'
import { execute_reconcile } from '../engine/pipeline/reconcile.exec.js'
import { log_error, set_verbose } from '../ui/index.js'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Register Reconcile Command
 *
 * Registers the `reconcile` subcommand with the CLI program.
 *
 * @param program - The commander program instance.
 */
export const register_reconcile = (program: Command): void => {
  program
    .command('reconcile')
    .description('Reconcile extracted domain knowledge for cross-domain consistency')
    .argument('<target>', 'Path to the codebase')
    .option('-m, --model <model>', 'Claude model to use')
    .option('--max-retries <n>', 'Max retries per Claude invocation', parseInt)
    .option('--timeout <ms>', 'Timeout per Claude invocation (ms)', parseInt)
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (target: string, opts: Record<string, unknown>) => {
      try {
        set_verbose(opts.verbose as boolean ?? false)

        const config = resolve_config(target, {
          model: opts.model as string | undefined,
          max_retries: opts.maxRetries as number | undefined,
          timeout: opts.timeout as number | undefined,
          verbose: opts.verbose as boolean | undefined
        })

        await execute_reconcile(config)
      } catch (err) {
        log_error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}
