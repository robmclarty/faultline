import type {
  PipelineState,
  BudgetLog,
  FileIndex,
  Domain,
  ExtractionPlan
} from '../types.js'

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
    const duration = format_duration(phase.started_at, phase.completed_at)
    const duration_str = duration ? ` (${duration})` : ''

    lines.push(`${icon} ${phase.phase} — ${phase.status}${duration_str}`)

    for (const task of phase.tasks) {
      const task_icon = status_icon(task.status)
      const task_dur = format_duration(task.started_at, task.completed_at)
      const task_dur_str = task_dur ? ` (${task_dur})` : ''

      lines.push(`  ${task_icon} ${task.name} — ${task.status}${task_dur_str}`)

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

/**
 * Format Dry Run Report
 *
 * Formats the extraction plan as a dry-run report showing per-domain task
 * counts, batch counts, token usage, estimated invocations, and projected cost.
 *
 * @param plan - The extraction plan.
 * @param domains - The domain list.
 * @returns Formatted dry-run report string.
 */
export const format_dry_run = (
  plan: ExtractionPlan,
  domains: Domain[]
): string => {
  const domain_map = new Map(domains.map(d => [d.id, d]))

  // Group tasks by domain
  const domain_tasks = new Map<string, typeof plan.tasks>()

  for (const task of plan.tasks) {
    const existing = domain_tasks.get(task.domain_id)

    if (existing) {
      existing.push(task)
    } else {
      domain_tasks.set(task.domain_id, [task])
    }
  }

  const lines = [
    'Dry Run — Extraction Plan',
    '═'.repeat(60),
    ''
  ]

  let total_tokens = 0
  let total_batches = 0
  let total_files = 0

  for (const [domain_id, tasks] of domain_tasks) {
    const domain = domain_map.get(domain_id)
    const label = domain?.label ?? domain_id
    const batch_count = tasks.length
    const file_count = tasks.reduce((sum, t) => sum + t.files.length, 0)
    const token_count = tasks.reduce((sum, t) => sum + t.estimated_tokens, 0)

    total_tokens += token_count
    total_batches += batch_count
    total_files += file_count

    lines.push(
      `  ${label} (${domain_id})`,
      `    Batches: ${batch_count}  |  Files: ${file_count}  |  ` +
      `~${token_count.toLocaleString()} tokens`
    )
  }

  // Estimate Claude invocations:
  // Per domain: batches + 1 consolidation + 1 review = batches + 2
  // Survey: ~5 invocations (classify, domains, review, plan, arch)
  // Reconcile: ~1 per cluster (estimate 1 cluster per 3 domains)
  // Synthesize: domains + 5 (summaries + per-domain specs + overview + arch + constraints + taste)
  const domain_count = domain_tasks.size
  const extract_invocations = total_batches + domain_count * 2
  const survey_invocations = 5
  const reconcile_invocations = Math.max(1, Math.ceil(domain_count / 3))
  const synthesize_invocations = domain_count + 5
  const total_invocations = survey_invocations + extract_invocations +
    reconcile_invocations + synthesize_invocations

  // Cost estimate using sonnet pricing ($3/1M input, $15/1M output)
  // Rough assumption: output is ~20% of input tokens
  const estimated_input = total_tokens
  const estimated_output = Math.ceil(total_tokens * 0.2)
  const estimated_cost = (estimated_input / 1_000_000) * 3 +
    (estimated_output / 1_000_000) * 15

  lines.push(
    '',
    '─'.repeat(60),
    `  Total domains:     ${domain_count}`,
    `  Total batches:     ${total_batches}`,
    `  Total files:       ${total_files}`,
    `  Total tokens:      ~${total_tokens.toLocaleString()}`,
    `  Est. invocations:  ~${total_invocations}`,
    `  Est. cost:         ~$${estimated_cost.toFixed(2)} (sonnet pricing)`,
    '',
    `  Context budget:    ${plan.context_budget.toLocaleString()} tokens/batch`
  )

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

/**
 * Formats the elapsed time between two ISO timestamps as a human-readable
 * duration string (e.g., "2m 30s").
 */
const format_duration = (
  started_at?: string,
  completed_at?: string
): string | null => {
  if (!started_at) return null

  const start = new Date(started_at).getTime()
  const end = completed_at
    ? new Date(completed_at).getTime()
    : Date.now()

  const elapsed_ms = end - start

  if (elapsed_ms < 0) return null

  const seconds = Math.floor(elapsed_ms / 1000)

  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const remaining_seconds = seconds % 60

  if (minutes < 60) return `${minutes}m ${remaining_seconds}s`

  const hours = Math.floor(minutes / 60)
  const remaining_minutes = minutes % 60

  return `${hours}h ${remaining_minutes}m`
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
