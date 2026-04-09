import type { PipelineState, BudgetLog, FileIndex, Domain } from '../types.js'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Format Status Report
 *
 * Formats the pipeline state as a human-readable status table.
 *
 * @param state - The pipeline state.
 * @returns Formatted status string.
 */
export const format_status = (state: PipelineState): string => {
  const lines = [
    `Pipeline: ${state.target_dir}`,
    `Created:  ${state.created_at}`,
    `Updated:  ${state.updated_at}`,
    ''
  ]

  if (state.phases.length === 0) {
    lines.push('No phases started.')
    return lines.join('\n')
  }

  for (const phase of state.phases) {
    const icon = status_icon(phase.status)

    lines.push(`${icon} ${phase.phase} — ${phase.status}`)

    for (const task of phase.tasks) {
      const task_icon = status_icon(task.status)

      lines.push(`  ${task_icon} ${task.name} — ${task.status}`)

      if (task.error) {
        lines.push(`    Error: ${task.error}`)
      }
    }

    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Format Budget Summary
 *
 * Formats the budget log as a cost summary.
 *
 * @param budget - The budget log.
 * @returns Formatted budget summary string.
 */
export const format_budget = (budget: BudgetLog): string => {
  const lines = [
    'Cost Summary',
    '─'.repeat(60)
  ]

  for (const entry of budget.entries) {
    lines.push(
      `  ${entry.phase}/${entry.task} (${entry.model}): ` +
      `${entry.input_tokens} in / ${entry.output_tokens} out — ` +
      `$${entry.estimated_cost.toFixed(4)}`
    )
  }

  lines.push('─'.repeat(60))
  lines.push(`  Total: $${budget.total_cost.toFixed(4)}`)

  return lines.join('\n')
}

/**
 * Format Survey Summary
 *
 * Formats a brief summary of survey results.
 *
 * @param file_index - The file index.
 * @param domains - The domain classifications.
 * @returns Formatted summary string.
 */
export const format_survey_summary = (
  file_index: FileIndex,
  domains: Domain[]
): string => {
  const total_files = file_index.length
  const total_tokens = file_index.reduce((sum, f) => sum + f.tokens_est, 0)
  const by_category = group_by(file_index, f => f.category)

  const lines = [
    'Survey Complete',
    '─'.repeat(40),
    `  Files: ${total_files}`,
    `  Estimated tokens: ${total_tokens.toLocaleString()}`,
    `  Domains: ${domains.length}`,
    '',
    '  By category:'
  ]

  for (const [cat, files] of Object.entries(by_category)) {
    lines.push(`    ${cat}: ${files.length} files`)
  }

  return lines.join('\n')
}

///////////////////////////////////////////////////////////////////// Helpers //

const status_icon = (status: string): string => {
  switch (status) {
    case 'completed': return '✓'
    case 'running': return '⏳'
    case 'failed': return '✗'
    case 'skipped': return '⊘'
    default: return '○'
  }
}

const group_by = <T>(items: T[], key_fn: (item: T) => string): Record<string, T[]> => {
  const groups: Record<string, T[]> = {}

  for (const item of items) {
    const key = key_fn(item)

    if (!groups[key]) {
      groups[key] = []
    }

    groups[key].push(item)
  }

  return groups
}
