import type { Command } from 'commander'

import { log_info } from '../ui/index.js'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Register Synthesize Command
 *
 * Registers the `synthesize` subcommand. Implemented in a later phase.
 *
 * @param program - The commander program instance.
 */
export const register_synthesize = (program: Command): void => {
  program
    .command('synthesize')
    .description('Synthesize extracted knowledge into product specs')
    .argument('<target>', 'Path to the codebase')
    .option('-m, --model <model>', 'Claude model to use')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async () => {
      log_info('Synthesize phase not yet implemented.')
    })
}
