import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { invoke_claude } from '../claude/invoke.js'
import { load_prompt } from '../claude/prompt_loader.js'
import { extract_json_block, extract_markdown_body } from '../claude/response_parser.js'
import { estimate_tokens } from '../token_estimator.js'
import {
  read_state,
  write_state,
  init_state,
  get_or_create_phase,
  update_task_status,
  mark_phase_completed,
  mark_phase_failed,
  is_phase_completed,
  read_domains,
  read_extraction_plan,
  read_manifest,
  read_architecture,
  write_batch_notes,
  read_batch_notes,
  write_consolidated_notes,
  read_consolidated_notes,
  write_extraction_review,
  write_deep_pass_notes,
  read_deep_pass_notes
} from '../../stores/index.js'
import { append_learnings, get_domain_learnings } from '../../stores/learnings.js'
import {
  log_info,
  log_success,
  log_error,
  log_warn,
  log_step,
  log_debug,
  create_spinner
} from '../../ui/index.js'
import type {
  FaultlineConfig,
  Domain,
  ExtractionTask,
  ExtractionReview,
  Manifest,
  LearningEntry
} from '../../types.js'

///////////////////////////////////////////////////////////////// Constants //

const HANDOFF_CHAR_BUDGET = 8_000
const ARCHITECTURE_DIGEST_CHARS = 4_000
const DEEP_PASS_TOKEN_BUDGET = 50_000

///////////////////////////////////////////////////////////////////////// API //

/**
 * Execute Extract
 *
 * Runs the full extraction pipeline: per-batch extraction with handoff context,
 * consolidation, review, optional retry, deep pass for high-priority domains,
 * and learnings management. Tasks run in parallel up to the concurrency limit.
 *
 * @param config - The resolved faultline configuration.
 */
export const execute_extract = async (config: FaultlineConfig): Promise<void> => {
  const output_dir = join(config.target_dir, config.output_dir)

  // Verify survey completed
  let state = await read_state(output_dir)

  if (!state) {
    state = init_state(config.target_dir)
  }

  if (!is_phase_completed(state, 'survey')) {
    throw new Error('Survey phase must be completed before extraction. Run `faultline survey` first.')
  }

  // Load survey artifacts
  const domains = await read_domains(output_dir)
  const plan = await read_extraction_plan(output_dir)
  const manifest = await read_manifest(output_dir)
  const architecture_raw = await read_architecture(output_dir)

  if (!domains || !plan) {
    throw new Error('Survey artifacts missing (domains.json or extraction_plan.json)')
  }

  const architecture_digest = architecture_raw
    ? truncate_to_budget(architecture_raw, ARCHITECTURE_DIGEST_CHARS)
    : 'No architecture description available.'

  const domain_map = new Map(domains.map(d => [d.id, d]))
  const framework_keywords = manifest
    ? extract_framework_keywords(manifest)
    : []

  // Initialize extract phase
  const phase = get_or_create_phase(state, 'extract')

  phase.status = 'running'
  phase.started_at = phase.started_at ?? new Date().toISOString()
  await write_state(output_dir, state)

  try {
    // Group tasks by domain for serial-within-domain execution
    const domain_tasks = group_tasks_by_domain(plan.tasks)
    const domain_ids = Array.from(domain_tasks.keys())

    log_info(
      `Extracting ${domain_ids.length} domains ` +
      `(${plan.total_batches} batches, concurrency ${config.concurrency})`
    )

    // Process domains in parallel up to concurrency limit
    const domain_queue = [...domain_ids]
    const active = new Set<Promise<void>>()

    while (domain_queue.length > 0 || active.size > 0) {
      while (domain_queue.length > 0 && active.size < config.concurrency) {
        const domain_id = domain_queue.shift()!
        const tasks = domain_tasks.get(domain_id)!
        const domain = domain_map.get(domain_id)

        if (!domain) {
          log_warn(`Domain ${domain_id} not found in domains.json, skipping`)
          continue
        }

        // Skip domains that are already fully completed (resume support)
        const domain_task = phase.tasks.find(t => t.id === `domain_${domain_id}`)

        if (domain_task?.status === 'completed') {
          log_debug(`Skipping completed domain: ${domain_id}`)
          continue
        }

        const promise = process_domain(
          domain,
          tasks,
          config,
          output_dir,
          architecture_digest,
          framework_keywords,
          phase,
          state
        ).then(() => {
          active.delete(promise)
        }).catch(err => {
          active.delete(promise)
          const msg = err instanceof Error ? err.message : String(err)

          log_error(`Domain ${domain_id} failed: ${msg}`)
          update_task_status(
            phase,
            `domain_${domain_id}`,
            `Domain: ${domain.label}`,
            'failed',
            msg
          )
        })

        active.add(promise)
      }

      // Wait for at least one to complete before launching more
      if (active.size > 0) {
        await Promise.race(active)
      }
    }

    // Check if any domains failed
    const failed_tasks = phase.tasks.filter(t => t.status === 'failed')

    if (failed_tasks.length > 0) {
      log_warn(
        `${failed_tasks.length} domain(s) failed during extraction. ` +
        'Run extract again to retry failed domains.'
      )
    }

    mark_phase_completed(phase)
    await write_state(output_dir, state)
    log_success('Extraction phase completed')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    log_error(`Extraction failed: ${message}`)
    mark_phase_failed(phase)
    await write_state(output_dir, state)
    throw err
  }
}

///////////////////////////////////////////////////////////////////// Helpers //

/**
 * Processes a single domain end-to-end: batch extraction (serial within domain),
 * consolidation, review, optional retry, optional deep pass, and learnings.
 */
const process_domain = async (
  domain: Domain,
  tasks: ExtractionTask[],
  config: FaultlineConfig,
  output_dir: string,
  architecture_digest: string,
  framework_keywords: string[],
  phase: Awaited<ReturnType<typeof get_or_create_phase>>,
  state: Awaited<ReturnType<typeof read_state>> & object
): Promise<void> => {
  log_step('2a', `Extracting domain: ${domain.label}`)

  // Sort tasks by batch_index for serial execution within domain
  const sorted = [...tasks].sort((a, b) => a.batch_index - b.batch_index)

  // Step 2a: Extract each batch serially (within domain)
  for (const task of sorted) {
    const task_id = `extract_${domain.id}_batch_${task.batch_index}`

    // Check if already completed (for resume support)
    const existing_task = phase.tasks.find(t => t.id === task_id)

    if (existing_task?.status === 'completed') {
      log_debug(`Skipping completed task: ${task_id}`)
      continue
    }

    update_task_status(phase, task_id, `Extract: ${domain.label} batch ${task.batch_index}`, 'running')
    await write_state(output_dir, state)

    await extract_batch(
      domain,
      task,
      config,
      output_dir,
      architecture_digest
    )

    update_task_status(phase, task_id, `Extract: ${domain.label} batch ${task.batch_index}`, 'completed')
    await write_state(output_dir, state)
  }

  // Step 2b: Consolidate batch notes
  const consolidate_id = `consolidate_${domain.id}`

  update_task_status(phase, consolidate_id, `Consolidate: ${domain.label}`, 'running')
  await write_state(output_dir, state)

  log_step('2b', `Consolidating domain: ${domain.label}`)
  await consolidate_domain(domain, sorted, config, output_dir)

  update_task_status(phase, consolidate_id, `Consolidate: ${domain.label}`, 'completed')
  await write_state(output_dir, state)

  // Step 2c: Review extraction
  const review_id = `review_${domain.id}`

  update_task_status(phase, review_id, `Review: ${domain.label}`, 'running')
  await write_state(output_dir, state)

  log_step('2c', `Reviewing domain: ${domain.label}`)
  const all_planned_files = sorted.flatMap(t => t.files)
  const review = await review_extraction(
    domain,
    all_planned_files,
    framework_keywords,
    config,
    output_dir
  )

  await write_extraction_review(output_dir, domain.id, review)

  // Step 2c': Validate file coverage
  const consolidated = await read_consolidated_notes(output_dir, domain.id)
  const missing_files = find_missing_files(all_planned_files, consolidated ?? '')

  if (missing_files.length > 0) {
    log_info(
      `${missing_files.length} files not referenced in ${domain.label} notes, ` +
      'attempting validation retry'
    )

    await validate_and_retry(
      domain,
      missing_files,
      config,
      output_dir,
      sorted
    )
  }

  // Step 2c'': Retry consolidation if review failed
  if (!review.passed) {
    log_info(`Review failed for ${domain.label}, retrying consolidation with feedback`)
    await consolidate_domain(
      domain,
      sorted,
      config,
      output_dir,
      format_review_feedback(review)
    )
  }

  update_task_status(phase, review_id, `Review: ${domain.label}`, 'completed')
  await write_state(output_dir, state)

  // Step 2d: Deep pass for high-priority domains with suggestions
  const is_high_priority = domain.priority <= 2
  const has_suggestions = review.suggestions.length > 0

  if (is_high_priority && has_suggestions && !config.skip_deep_pass) {
    const deep_id = `deep_pass_${domain.id}`

    update_task_status(phase, deep_id, `Deep pass: ${domain.label}`, 'running')
    await write_state(output_dir, state)

    log_step('2d', `Deep pass: ${domain.label}`)
    await deep_pass_domain(domain, review, config, output_dir)

    // Merge deep pass findings into consolidated notes
    await merge_deep_pass(domain, config, output_dir)

    update_task_status(phase, deep_id, `Deep pass: ${domain.label}`, 'completed')
    await write_state(output_dir, state)
  } else if (is_high_priority && !has_suggestions) {
    log_debug(`Skipping deep pass for ${domain.label}: review passed cleanly`)
  } else if (config.skip_deep_pass) {
    log_debug(`Skipping deep pass for ${domain.label}: --skip-deep-pass flag`)
  }

  // Step 2e: Extract cross-domain learnings from consolidated notes
  const final_notes = await read_consolidated_notes(output_dir, domain.id)

  if (final_notes) {
    const learnings = extract_cross_domain_learnings(domain, final_notes)

    if (learnings.length > 0) {
      await append_learnings(output_dir, learnings)
      log_debug(`Appended ${learnings.length} learnings from ${domain.label}`)
    }
  }

  // Mark domain-level task completed
  update_task_status(
    phase,
    `domain_${domain.id}`,
    `Domain: ${domain.label}`,
    'completed'
  )
  await write_state(output_dir, state)

  log_success(`Domain ${domain.label} extraction complete`)
}

/**
 * Extracts a single batch of files. Loads source files, builds the prompt with
 * handoff context from prior batches, and invokes Claude.
 */
const extract_batch = async (
  domain: Domain,
  task: ExtractionTask,
  config: FaultlineConfig,
  output_dir: string,
  architecture_digest: string
): Promise<void> => {
  // Load domain-filtered learnings
  const learnings = await get_domain_learnings(output_dir, domain.id)
  const learnings_text = learnings.length > 0
    ? learnings.map(l => `- [${l.type}] ${l.content}`).join('\n')
    : 'No prior learnings for this domain.'

  // Build handoff context from prior batch
  let handoff_context = ''

  if (task.batch_index > 0) {
    const prior_notes = await read_batch_notes(output_dir, domain.id, task.batch_index - 1)

    if (prior_notes) {
      const compressed = truncate_to_budget(prior_notes, HANDOFF_CHAR_BUDGET)

      handoff_context =
        '**Prior batch notes (compressed):**\n' +
        compressed
    }
  }

  // Load source files
  const source_content = await load_source_files(task.files, config.target_dir)

  // Build prompt
  const system_prompt = await load_prompt('extract/system.md', {
    domain_label: domain.label,
    domain_description: domain.description,
    architecture_digest,
    learnings: learnings_text,
    handoff_context: handoff_context
      ? `\n## Prior Batch Context\n\n${handoff_context}`
      : ''
  })

  const spinner = create_spinner(
    `Extracting ${domain.label} batch ${task.batch_index} (${task.files.length} files)`
  )

  try {
    const result = await invoke_claude({
      model: config.model,
      system_prompt,
      input: source_content,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'extract',
      task: `extract_${domain.id}_batch_${task.batch_index}`,
      verbose: config.verbose
    })

    spinner.stop()

    const notes = extract_markdown_body(result.stdout)

    await write_batch_notes(output_dir, domain.id, task.batch_index, notes)
    log_debug(`Batch ${task.batch_index} complete for ${domain.label}`)
  } catch (err) {
    spinner.stop()
    throw err
  }
}

/**
 * Consolidates all batch notes for a domain into a single document. Optionally
 * includes review feedback for retry consolidation.
 */
const consolidate_domain = async (
  domain: Domain,
  tasks: ExtractionTask[],
  config: FaultlineConfig,
  output_dir: string,
  review_feedback?: string
): Promise<void> => {
  // Collect all batch notes
  const batch_notes_parts: string[] = []

  for (const task of tasks) {
    const notes = await read_batch_notes(output_dir, domain.id, task.batch_index)

    if (notes) {
      batch_notes_parts.push(`## Batch ${task.batch_index}\n\n${notes}`)
    }
  }

  const all_batch_notes = batch_notes_parts.join('\n\n---\n\n')

  // For single-batch domains, the batch notes ARE the consolidated notes
  // but we still run consolidation for formatting consistency
  const system_prompt = await load_prompt('extract/consolidate.md', {
    domain_label: domain.label,
    batch_notes: all_batch_notes,
    review_feedback: review_feedback
      ? `\n## Review Feedback\n\nThe previous consolidation was rejected. Address these issues:\n\n${review_feedback}`
      : ''
  })

  const spinner = create_spinner(`Consolidating ${domain.label}`)

  try {
    const result = await invoke_claude({
      model: config.model,
      system_prompt,
      input: all_batch_notes,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'extract',
      task: `consolidate_${domain.id}${review_feedback ? '_retry' : ''}`,
      verbose: config.verbose
    })

    spinner.stop()

    const notes = extract_markdown_body(result.stdout)

    await write_consolidated_notes(output_dir, domain.id, notes)
  } catch (err) {
    spinner.stop()
    throw err
  }
}

/**
 * Reviews the consolidated extraction notes for a domain. Uses the review model
 * (typically sonnet) to check file coverage, abstraction violations, and more.
 */
const review_extraction = async (
  domain: Domain,
  planned_files: string[],
  framework_keywords: string[],
  config: FaultlineConfig,
  output_dir: string
): Promise<ExtractionReview> => {
  const consolidated = await read_consolidated_notes(output_dir, domain.id)

  if (!consolidated) {
    return {
      passed: false,
      issues: ['No consolidated notes found'],
      suggestions: [],
      uncovered_files: planned_files
    }
  }

  const system_prompt = await load_prompt('extract/review.md', {
    domain_label: domain.label,
    planned_files: planned_files.join('\n'),
    consolidated_notes: consolidated,
    framework_keywords: framework_keywords.length > 0
      ? framework_keywords.join(', ')
      : 'None identified'
  })

  const spinner = create_spinner(`Reviewing ${domain.label}`)

  try {
    const result = await invoke_claude({
      model: config.review_model,
      system_prompt,
      input: consolidated,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'extract',
      task: `review_${domain.id}`,
      verbose: config.verbose
    })

    spinner.stop()

    return extract_json_block<ExtractionReview>(result.stdout)
  } catch {
    spinner.stop()

    // On review failure, return a passed review so extraction can proceed
    log_warn(`Review invocation failed for ${domain.label}, proceeding without review`)

    return {
      passed: true,
      issues: [],
      suggestions: [],
      uncovered_files: []
    }
  }
}

/**
 * Validates that all planned files are referenced in consolidated notes. If
 * missing files are found, invokes Claude with feedback to produce additional
 * notes, then re-consolidates.
 */
const validate_and_retry = async (
  domain: Domain,
  missing_files: string[],
  config: FaultlineConfig,
  output_dir: string,
  tasks: ExtractionTask[],
  attempt = 0
): Promise<void> => {
  if (attempt >= config.max_retries) {
    log_warn(
      `Validation retry limit reached for ${domain.label}, ` +
      `${missing_files.length} files still uncovered`
    )
    return
  }

  // Load the missing source files
  const source_content = await load_source_files(missing_files, config.target_dir)

  const system_prompt = await load_prompt('extract/validate_feedback.md', {
    domain_label: domain.label,
    missing_files: missing_files.map(f => `- ${f}`).join('\n')
  })

  const spinner = create_spinner(
    `Validation retry ${attempt + 1} for ${domain.label} (${missing_files.length} missing files)`
  )

  try {
    const result = await invoke_claude({
      model: config.model,
      system_prompt,
      input: source_content,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'extract',
      task: `validate_${domain.id}_retry_${attempt}`,
      verbose: config.verbose
    })

    spinner.stop()

    const additional_notes = extract_markdown_body(result.stdout)

    // Write as an additional batch
    const next_batch = tasks.length + attempt
    await write_batch_notes(output_dir, domain.id, next_batch, additional_notes)

    // Re-consolidate with the new batch included
    const extended_tasks = [
      ...tasks,
      {
        domain_id: domain.id,
        batch_index: next_batch,
        files: missing_files,
        estimated_tokens: 0
      }
    ]

    await consolidate_domain(domain, extended_tasks, config, output_dir)

    // Re-check coverage
    const consolidated = await read_consolidated_notes(output_dir, domain.id)
    const still_missing = find_missing_files(missing_files, consolidated ?? '')

    if (still_missing.length > 0) {
      await validate_and_retry(domain, still_missing, config, output_dir, tasks, attempt + 1)
    }
  } catch (err) {
    spinner.stop()
    log_warn(`Validation retry failed for ${domain.label}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Performs a deep extraction pass on a high-priority domain. Re-reads a
 * representative subset of source files alongside consolidated notes.
 */
const deep_pass_domain = async (
  domain: Domain,
  review: ExtractionReview,
  config: FaultlineConfig,
  output_dir: string
): Promise<void> => {
  const consolidated = await read_consolidated_notes(output_dir, domain.id)

  if (!consolidated) {
    log_warn(`No consolidated notes for deep pass on ${domain.label}`)
    return
  }

  // Prioritize uncovered files, then sample remaining files up to budget
  const target_files = select_deep_pass_files(
    domain,
    review,
    config.target_dir,
    DEEP_PASS_TOKEN_BUDGET
  )

  const source_content = await load_source_files(target_files, config.target_dir)

  const system_prompt = await load_prompt('extract/deep_pass.md', {
    domain_label: domain.label,
    domain_description: domain.description,
    consolidated_notes: consolidated,
    reviewer_suggestions: review.suggestions.map(s => `- ${s}`).join('\n')
  })

  const spinner = create_spinner(`Deep pass: ${domain.label}`)

  try {
    const result = await invoke_claude({
      model: config.model,
      system_prompt,
      input: source_content,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'extract',
      task: `deep_pass_${domain.id}`,
      verbose: config.verbose
    })

    spinner.stop()

    const notes = extract_markdown_body(result.stdout)

    await write_deep_pass_notes(output_dir, domain.id, notes)
  } catch (err) {
    spinner.stop()
    log_warn(`Deep pass failed for ${domain.label}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Merges deep pass findings into consolidated notes. Re-runs consolidation
 * with the deep pass notes appended, respecting the 5k token ceiling.
 */
const merge_deep_pass = async (
  domain: Domain,
  config: FaultlineConfig,
  output_dir: string
): Promise<void> => {
  const consolidated = await read_consolidated_notes(output_dir, domain.id)
  const deep_notes = await read_deep_pass_notes(output_dir, domain.id)

  if (!consolidated || !deep_notes) {
    return
  }

  const merged_input = [
    '## Existing Consolidated Notes\n',
    consolidated,
    '\n---\n',
    '## Deep Pass Findings\n',
    deep_notes
  ].join('\n')

  const system_prompt = await load_prompt('extract/consolidate.md', {
    domain_label: domain.label,
    batch_notes: merged_input,
    review_feedback:
      '\n## Merge Instructions\n\n' +
      'Merge the deep pass findings into the existing consolidated notes. ' +
      'Do not lose any existing observations. Add the new findings in the ' +
      'appropriate sections. Stay within 4,000 words.'
  })

  const spinner = create_spinner(`Merging deep pass for ${domain.label}`)

  try {
    const result = await invoke_claude({
      model: config.model,
      system_prompt,
      input: merged_input,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'extract',
      task: `merge_deep_pass_${domain.id}`,
      verbose: config.verbose
    })

    spinner.stop()

    const notes = extract_markdown_body(result.stdout)

    await write_consolidated_notes(output_dir, domain.id, notes)
  } catch (err) {
    spinner.stop()
    log_warn(
      `Deep pass merge failed for ${domain.label}: ` +
      `${err instanceof Error ? err.message : String(err)}`
    )
  }
}

/**
 * Loads source files from disk, formatting each with a path header.
 */
const load_source_files = async (
  file_paths: string[],
  target_dir: string
): Promise<string> => {
  const parts: string[] = []

  for (const file_path of file_paths) {
    try {
      const full_path = join(target_dir, file_path)
      const content = await readFile(full_path, 'utf-8')

      parts.push(`--- ${file_path} ---\n${content}`)
    } catch {
      // File may have been deleted or moved since survey
      parts.push(`--- ${file_path} ---\n[File not readable]`)
    }
  }

  return parts.join('\n\n')
}

/**
 * Groups extraction tasks by domain_id, preserving order.
 */
const group_tasks_by_domain = (
  tasks: ExtractionTask[]
): Map<string, ExtractionTask[]> => {
  const map = new Map<string, ExtractionTask[]>()

  for (const task of tasks) {
    const existing = map.get(task.domain_id)

    if (existing) {
      existing.push(task)
    } else {
      map.set(task.domain_id, [task])
    }
  }

  return map
}

/**
 * Extracts framework keywords from the dependency manifest. These are used
 * by the extraction reviewer to detect abstraction violations.
 */
const extract_framework_keywords = (manifest: Manifest): string[] => {
  const keywords: string[] = []

  for (const dep of manifest.dependencies) {
    // Add the package name itself
    keywords.push(dep.name)

    // Extract meaningful short names (e.g., "express" from "express")
    const short = dep.name.replace(/^@[^/]+\//, '')

    if (short !== dep.name) {
      keywords.push(short)
    }
  }

  return [...new Set(keywords)]
}

/**
 * Finds source files from the plan that are not referenced in the consolidated
 * notes. Uses simple filename matching (basename grep).
 */
const find_missing_files = (
  planned_files: string[],
  consolidated_notes: string
): string[] => {
  const notes_lower = consolidated_notes.toLowerCase()

  return planned_files.filter(file_path => {
    const basename = file_path.split('/').pop() ?? file_path

    return !notes_lower.includes(basename.toLowerCase())
  })
}

/**
 * Selects files for the deep extraction pass. Prioritizes uncovered files
 * from the review, then adds domain files up to the token budget.
 */
const select_deep_pass_files = (
  domain: Domain,
  review: ExtractionReview,
  _target_dir: string,
  token_budget: number
): string[] => {
  const selected: string[] = []
  let tokens_used = 0

  // Prioritize uncovered files
  for (const file of review.uncovered_files) {
    const est = estimate_tokens(1000, file.split('.').pop() ? `.${file.split('.').pop()}` : '')

    if (tokens_used + est <= token_budget) {
      selected.push(file)
      tokens_used += est
    }
  }

  // Fill remaining budget with domain key files
  for (const file of domain.key_files) {
    if (!selected.includes(file)) {
      const est = estimate_tokens(2000, file.split('.').pop() ? `.${file.split('.').pop()}` : '')

      if (tokens_used + est <= token_budget) {
        selected.push(file)
        tokens_used += est
      }
    }
  }

  return selected
}

/**
 * Truncates content to fit within a character budget.
 */
const truncate_to_budget = (content: string, char_budget: number): string => {
  if (content.length <= char_budget) {
    return content
  }

  return content.slice(0, char_budget) + '\n\n[...truncated for context budget]'
}

/**
 * Formats review feedback for the consolidation retry prompt.
 */
const format_review_feedback = (review: ExtractionReview): string => {
  const parts: string[] = []

  if (review.issues.length > 0) {
    parts.push('### Issues\n')
    parts.push(...review.issues.map(i => `- ${i}`))
  }

  if (review.suggestions.length > 0) {
    parts.push('\n### Suggestions\n')
    parts.push(...review.suggestions.map(s => `- ${s}`))
  }

  if (review.uncovered_files.length > 0) {
    parts.push('\n### Uncovered Files\n')
    parts.push(...review.uncovered_files.map(f => `- ${f}`))
  }

  return parts.join('\n')
}

/**
 * Extracts cross-domain observations from consolidated notes and converts
 * them into learning entries for the learnings system.
 */
const extract_cross_domain_learnings = (
  domain: Domain,
  notes: string
): LearningEntry[] => {
  const learnings: LearningEntry[] = []
  const lines = notes.split('\n')
  let in_crossdomain = false

  for (const line of lines) {
    if (line.match(/#+\s*cross.domain\s+observations/i)) {
      in_crossdomain = true
      continue
    }

    if (in_crossdomain && line.match(/^#+\s/) && !line.match(/#+\s*cross.domain/i)) {
      in_crossdomain = false
      continue
    }

    if (in_crossdomain && line.trim().startsWith('-')) {
      const content = line.trim().replace(/^-\s*/, '')

      if (content.length > 10) {
        learnings.push({
          id: `extract_${domain.id}_${learnings.length}`,
          type: 'observation',
          domain: domain.id,
          content,
          source_phase: 'extract',
          created_at: new Date().toISOString(),
          tokens_est: Math.ceil(content.length / 4)
        })
      }
    }
  }

  return learnings
}
