import { join, resolve } from 'node:path'

import type { Command } from 'commander'

import { read_state } from '../stores/state.js'
import { read_budget } from '../stores/budget.js'
import { format_status, format_budget, log_info } from '../ui/index.js'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Register Status Command
 *
 * Registers the `status` subcommand with the CLI program.
 *
 * @param program - The commander program instance.
 */
export const register_status = (program: Command): void => {
  program
    .command('status')
    .description('Show pipeline status for a codebase')
    .argument('<target>', 'Path to the codebase')
    .option('-o, --output-dir <dir>', 'Output directory name', '.faultline')
    .action(async (target: string, opts: { outputDir: string }) => {
      const target_dir = resolve(target)
      const output_dir = join(target_dir, opts.outputDir)
      const state = await read_state(output_dir)

      if (!state) {
        log_info('No pipeline state found')
        return
      }

      console.log(format_status(state))

      const budget = await read_budget(output_dir)

      if (budget.entries.length > 0) {
        console.log()
        console.log(format_budget(budget))
      }
    })
}
