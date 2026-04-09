import type { Command } from 'commander'

import { resolve_config } from '../stores/config.js'
import { execute_extract } from '../engine/pipeline/extract.exec.js'
import { log_error, set_verbose } from '../ui/index.js'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Register Extract Command
 *
 * Registers the `extract` subcommand with the CLI program.
 *
 * @param program - The commander program instance.
 */
export const register_extract = (program: Command): void => {
  program
    .command('extract')
    .description('Extract domain knowledge from a surveyed codebase')
    .argument('<target>', 'Path to the codebase')
    .option('-m, --model <model>', 'Claude model to use')
    .option('--concurrency <n>', 'Max parallel domain extractions', parseInt)
    .option('--max-retries <n>', 'Max validation retries per domain', parseInt)
    .option('--skip-deep-pass', 'Skip deep extraction for high-priority domains')
    .option('--timeout <ms>', 'Timeout per Claude invocation (ms)', parseInt)
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (target: string, opts: Record<string, unknown>) => {
      try {
        set_verbose(opts.verbose as boolean ?? false)

        const config = resolve_config(target, {
          model: opts.model as string | undefined,
          concurrency: opts.concurrency as number | undefined,
          max_retries: opts.maxRetries as number | undefined,
          skip_deep_pass: opts.skipDeepPass as boolean | undefined,
          timeout: opts.timeout as number | undefined,
          verbose: opts.verbose as boolean | undefined
        })

        await execute_extract(config)
      } catch (err) {
        log_error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}
