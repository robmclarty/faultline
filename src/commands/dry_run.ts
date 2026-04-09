import type { Command } from 'commander'

import { log_info } from '../ui/index.js'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Register Dry Run Command
 *
 * Registers the `dry-run` subcommand. Shows what the pipeline would do
 * without executing Claude invocations. Implemented in a later phase.
 *
 * @param program - The commander program instance.
 */
export const register_dry_run = (program: Command): void => {
  program
    .command('dry-run')
    .description('Preview what the pipeline would do without running Claude')
    .argument('<target>', 'Path to the codebase')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async () => {
      log_info('Dry-run not yet implemented.')
    })
}
