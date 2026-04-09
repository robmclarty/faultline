import type { Command } from 'commander'

import { log_info } from '../ui/index.js'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Register Reconcile Command
 *
 * Registers the `reconcile` subcommand. Implemented in a later phase.
 *
 * @param program - The commander program instance.
 */
export const register_reconcile = (program: Command): void => {
  program
    .command('reconcile')
    .description('Reconcile extracted domain knowledge')
    .argument('<target>', 'Path to the codebase')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async () => {
      log_info('Reconcile phase not yet implemented.')
    })
}
