import type { Command } from 'commander'

import { log_info } from '../ui/index.js'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Register Analyze Command
 *
 * Registers the `analyze` subcommand. Runs the full pipeline (survey +
 * extract + reconcile + synthesize). Implemented in a later phase.
 *
 * @param program - The commander program instance.
 */
export const register_analyze = (program: Command): void => {
  program
    .command('analyze')
    .description('Run the full analysis pipeline (survey → extract → reconcile → synthesize)')
    .argument('<target>', 'Path to the codebase to analyze')
    .option('-m, --model <model>', 'Claude model to use')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async () => {
      log_info('Full analysis pipeline not yet implemented. Use individual phase commands.')
    })
}
