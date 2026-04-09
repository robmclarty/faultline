import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

import type { BudgetEntry, BudgetLog } from '../types.js'

///////////////////////////////////////////////////////////////// Constants //

const BUDGET_FILE = 'budget.json'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Read Budget
 *
 * Reads the budget log from disk. Returns empty log if no file exists.
 *
 * @param output_dir - The .faultline directory path.
 * @returns The budget log.
 */
export const read_budget = async (output_dir: string): Promise<BudgetLog> => {
  const budget_path = join(output_dir, BUDGET_FILE)

  if (!existsSync(budget_path)) {
    return { entries: [], total_cost: 0 }
  }

  const content = await readFile(budget_path, 'utf-8')

  return JSON.parse(content) as BudgetLog
}

/**
 * Append Budget Entry
 *
 * Adds a new cost entry to the budget log and writes to disk.
 *
 * @param output_dir - The .faultline directory path.
 * @param entry - The budget entry to append.
 */
export const append_budget_entry = async (
  output_dir: string,
  entry: BudgetEntry
): Promise<void> => {
  await mkdir(output_dir, { recursive: true })

  const budget = await read_budget(output_dir)

  budget.entries.push(entry)
  budget.total_cost = budget.entries.reduce((sum, e) => sum + e.estimated_cost, 0)

  const budget_path = join(output_dir, BUDGET_FILE)

  await writeFile(budget_path, JSON.stringify(budget, null, 2), 'utf-8')
}

/**
 * Create Budget Entry
 *
 * Creates a budget entry from Claude invocation results.
 *
 * @param phase - The phase name.
 * @param task - The task name.
 * @param model - The model used.
 * @param input_tokens - Number of input tokens.
 * @param output_tokens - Number of output tokens.
 * @returns A budget entry.
 */
export const create_budget_entry = (
  phase: string,
  task: string,
  model: string,
  input_tokens: number,
  output_tokens: number
): BudgetEntry => ({
  timestamp: new Date().toISOString(),
  phase,
  task,
  model,
  input_tokens,
  output_tokens,
  estimated_cost: estimate_cost(model, input_tokens, output_tokens)
})

///////////////////////////////////////////////////////////////////// Helpers //

/**
 * Rough cost estimation based on published Claude pricing. Not meant to be
 * precise — just enough for budget awareness.
 */
const estimate_cost = (model: string, input_tokens: number, output_tokens: number): number => {
  const rates = get_model_rates(model)

  return (input_tokens / 1_000_000) * rates.input + (output_tokens / 1_000_000) * rates.output
}

const get_model_rates = (model: string): { input: number, output: number } => {
  if (model.includes('opus')) {
    return { input: 15, output: 75 }
  }

  if (model.includes('haiku')) {
    return { input: 0.25, output: 1.25 }
  }

  // Default to sonnet pricing
  return { input: 3, output: 15 }
}
