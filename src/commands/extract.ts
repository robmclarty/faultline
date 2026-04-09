import type { Command } from 'commander'

import { log_info } from '../ui/index.js'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Register Extract Command
 *
 * Registers the `extract` subcommand. Implemented in a later phase.
 *
 * @param program - The commander program instance.
 */
export const register_extract = (program: Command): void => {
  program
    .command('extract')
    .description('Extract domain knowledge from a surveyed codebase')
    .argument('<target>', 'Path to the codebase')
    .option('-m, --model <model>', 'Claude model to use')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async () => {
      log_info('Extract phase not yet implemented. Run survey first.')
    })
}
