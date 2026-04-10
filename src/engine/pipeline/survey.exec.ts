import { join } from 'node:path'

import { walk_files, generate_tree } from '../file_walker.js'
import { parse_manifest } from '../manifest_parser.js'
import { pack_batches, build_extraction_tasks } from '../batcher.js'
import { invoke_claude } from '../claude/invoke.js'
import { load_prompt } from '../claude/prompt_loader.js'
import { extract_markdown_body } from '../claude/response_parser.js'
import {
  CLASSIFY_FILES_SCHEMA,
  MAP_DOMAINS_SCHEMA,
  DOMAIN_REVIEW_SCHEMA
} from '../claude/schemas.js'
import {
  write_file_index,
  read_file_index,
  write_manifest,
  write_tree,
  read_tree,
  write_domains,
  read_domains,
  write_domain_review,
  write_extraction_plan,
  write_architecture,
  read_architecture,
  write_state,
  init_state,
  read_state,
  get_or_create_phase,
  update_task_status,
  mark_phase_completed,
  mark_phase_failed
} from '../../stores/index.js'
import { append_learnings } from '../../stores/learnings.js'
import {
  log_info,
  log_success,
  log_error,
  log_step,
  log_debug,
  create_spinner
} from '../../ui/index.js'
import type {
  FaultlineConfig,
  FileIndex,
  PhaseState,
  PipelineState,
  Domain,
  DomainReview,
  ExtractionPlan,
  LearningEntry
} from '../../types.js'

///////////////////////////////////////////////////////////////// Constants //

const CLASSIFY_BATCH_SIZE = 8_000

/////////////////////////////////////////////////////////////////// Types //

type SurveyContext = {
  config: FaultlineConfig
  output_dir: string
  phase: PhaseState
  state: PipelineState
}

///////////////////////////////////////////////////////////////// Helpers //

/**
 * Checks whether a task within a phase has already been completed.
 */
const is_task_done = (phase: PhaseState, task_id: string): boolean => {
  const task = phase.tasks.find(t => t.id === task_id)

  return task?.status === 'completed'
}

/**
 * Marks a task as running and persists state.
 */
const begin_task = async (
  ctx: SurveyContext,
  task_id: string,
  task_name: string
): Promise<void> => {
  update_task_status(ctx.phase, task_id, task_name, 'running')
  await write_state(ctx.output_dir, ctx.state)
}

/**
 * Step 1a: Walk the filesystem and build the file index. On resume, reloads
 * the persisted index instead.
 */
const step_file_index = async (ctx: SurveyContext): Promise<FileIndex> => {
  if (is_task_done(ctx.phase, 'file_index')) {
    log_info('Resuming: skipping file indexing (already completed)')

    return (await read_file_index(ctx.output_dir)) ?? []
  }

  log_step('1a', 'Indexing files')
  await begin_task(ctx, 'file_index', 'File indexing')

  const file_index = await walk_files(
    ctx.config.target_dir,
    ctx.config.include,
    ctx.config.exclude
  )

  await write_file_index(ctx.output_dir, file_index)
  log_success(`Indexed ${file_index.length} files`)
  update_task_status(ctx.phase, 'file_index', 'File indexing', 'completed')

  return file_index
}

/**
 * Step 1a': Parse the dependency manifest (package.json, etc.).
 */
const step_manifest = async (ctx: SurveyContext): Promise<void> => {
  if (is_task_done(ctx.phase, 'manifest')) {
    log_info('Resuming: skipping manifest parsing (already completed)')

    return
  }

  log_step('1a\'', 'Parsing dependency manifest')
  await begin_task(ctx, 'manifest', 'Manifest parsing')

  const manifest = await parse_manifest(ctx.config.target_dir)

  if (manifest) {
    await write_manifest(ctx.output_dir, manifest)
    log_success(
      `Parsed manifest: ${manifest.name}@${manifest.version} ` +
      `(${manifest.dependencies.length} dependencies)`
    )
  } else {
    log_info('No recognized dependency manifest found')
  }

  update_task_status(ctx.phase, 'manifest', 'Manifest parsing', 'completed')
}

/**
 * Step 1a'': Generate directory tree from file index.
 */
const step_tree = async (
  ctx: SurveyContext,
  file_index: FileIndex
): Promise<string> => {
  if (is_task_done(ctx.phase, 'tree')) {
    log_info('Resuming: skipping tree generation (already completed)')

    return (await read_tree(ctx.output_dir)) ?? ''
  }

  log_step('1a\'\'', 'Generating directory tree')
  await begin_task(ctx, 'tree', 'Tree generation')

  const tree = generate_tree(file_index)

  await write_tree(ctx.output_dir, tree)
  log_success('Generated directory tree')
  update_task_status(ctx.phase, 'tree', 'Tree generation', 'completed')

  return tree
}

/**
 * Step 1b: Classify files via Claude. On resume, reloads the classified index.
 */
const step_classify = async (
  ctx: SurveyContext,
  file_index: FileIndex
): Promise<FileIndex> => {
  if (is_task_done(ctx.phase, 'classify')) {
    log_info('Resuming: skipping file classification (already completed)')

    return (await read_file_index(ctx.output_dir)) ?? file_index
  }

  log_step('1b', 'Classifying files')
  await begin_task(ctx, 'classify', 'File classification')

  const classified_index = await classify_files(file_index, ctx.config, ctx.output_dir)

  await write_file_index(ctx.output_dir, classified_index)
  log_success('Files classified')
  update_task_status(ctx.phase, 'classify', 'File classification', 'completed')

  return classified_index
}

/**
 * Step 1c: Map files to domains via Claude.
 */
const step_domains = async (
  ctx: SurveyContext,
  classified_index: FileIndex,
  tree: string
): Promise<Domain[]> => {
  if (is_task_done(ctx.phase, 'domains')) {
    log_info('Resuming: skipping domain mapping (already completed)')

    return (await read_domains(ctx.output_dir)) ?? []
  }

  log_step('1c', 'Mapping domains')
  await begin_task(ctx, 'domains', 'Domain mapping')

  const domains = await map_domains(classified_index, tree, ctx.config, ctx.output_dir)

  await write_domains(ctx.output_dir, domains)
  log_success(`Mapped ${domains.length} domains`)
  update_task_status(ctx.phase, 'domains', 'Domain mapping', 'completed')

  return domains
}

/**
 * Step 1c': Adversarial review of domain assignments with optional retry.
 */
const step_domain_review = async (
  ctx: SurveyContext,
  domains: Domain[],
  classified_index: FileIndex,
  tree: string
): Promise<Domain[]> => {
  if (is_task_done(ctx.phase, 'domain_review')) {
    log_info('Resuming: skipping domain review (already completed)')

    return (await read_domains(ctx.output_dir)) ?? domains
  }

  log_step('1c\'', 'Reviewing domains')
  await begin_task(ctx, 'domain_review', 'Domain review')

  const review = await review_domains(domains, classified_index, ctx.config, ctx.output_dir)

  await write_domain_review(ctx.output_dir, review)

  let final_domains = domains

  if (!review.passed) {
    log_info('Domain review found issues, retrying domain mapping with feedback')

    final_domains = await retry_domain_mapping(
      classified_index,
      tree,
      review,
      ctx.config,
      ctx.output_dir
    )

    await write_domains(ctx.output_dir, final_domains)

    const retry_review = await review_domains(
      final_domains,
      classified_index,
      ctx.config,
      ctx.output_dir
    )

    await write_domain_review(ctx.output_dir, retry_review)
    log_success(
      `Domain review ${retry_review.passed ? 'passed' : 'completed with remaining issues'}`
    )
  } else {
    log_success('Domain review passed')
  }

  update_task_status(ctx.phase, 'domain_review', 'Domain review', 'completed')

  return final_domains
}

/**
 * Step 1d: Build the extraction plan from domains and classified index.
 */
const step_extraction_plan = async (
  ctx: SurveyContext,
  final_domains: Domain[],
  classified_index: FileIndex
): Promise<void> => {
  if (is_task_done(ctx.phase, 'extraction_plan')) {
    log_info('Resuming: skipping extraction plan (already completed)')

    return
  }

  log_step('1d', 'Generating extraction plan')
  await begin_task(ctx, 'extraction_plan', 'Extraction plan')

  const tasks = build_extraction_tasks(
    final_domains,
    classified_index,
    ctx.config.context_budget
  )

  const plan: ExtractionPlan = {
    context_budget: ctx.config.context_budget,
    total_batches: tasks.length,
    tasks
  }

  await write_extraction_plan(ctx.output_dir, plan)
  log_success(`Generated extraction plan with ${tasks.length} batches`)
  update_task_status(ctx.phase, 'extraction_plan', 'Extraction plan', 'completed')
}

/**
 * Step 1e: Generate architecture description via Claude.
 */
const step_architecture = async (
  ctx: SurveyContext,
  classified_index: FileIndex,
  final_domains: Domain[],
  tree: string
): Promise<string> => {
  if (is_task_done(ctx.phase, 'architecture')) {
    log_info('Resuming: skipping architecture description (already completed)')

    return (await read_architecture(ctx.output_dir)) ?? ''
  }

  log_step('1e', 'Generating architecture description')
  await begin_task(ctx, 'architecture', 'Architecture description')

  const arch_md = await describe_architecture(
    classified_index,
    final_domains,
    tree,
    ctx.config,
    ctx.output_dir
  )

  await write_architecture(ctx.output_dir, arch_md)
  log_success('Generated architecture description')
  update_task_status(ctx.phase, 'architecture', 'Architecture description', 'completed')

  return arch_md
}

/**
 * Step 1e': Extract cross-cutting learnings from the architecture description.
 */
const step_learnings = async (
  ctx: SurveyContext,
  arch_md: string
): Promise<void> => {
  if (is_task_done(ctx.phase, 'learnings')) {
    log_info('Resuming: skipping learnings extraction (already completed)')

    return
  }

  log_step('1e\'', 'Extracting learnings')
  await begin_task(ctx, 'learnings', 'Learnings extraction')

  const learnings = extract_architecture_learnings(arch_md)

  await append_learnings(ctx.output_dir, learnings)
  log_success(`Extracted ${learnings.length} learnings`)
  update_task_status(ctx.phase, 'learnings', 'Learnings extraction', 'completed')
}

///////////////////////////////////////////////////////////////////////// API //

/**
 * Execute Survey
 *
 * Runs the full survey pipeline: file indexing, manifest parsing, tree
 * generation, file classification, domain mapping, domain review, extraction
 * plan generation, and architecture description. Supports resume from any
 * completed task.
 *
 * @param config - The resolved faultline configuration.
 */
export const execute_survey = async (config: FaultlineConfig): Promise<void> => {
  const output_dir = join(config.target_dir, config.output_dir)

  // Initialize or resume state
  let state = await read_state(output_dir)

  if (!state) {
    state = init_state(config.target_dir)
  }

  const phase = get_or_create_phase(state, 'survey')

  phase.status = 'running'
  phase.started_at = new Date().toISOString()
  await write_state(output_dir, state)

  const ctx: SurveyContext = { config, output_dir, phase, state }

  try {
    const file_index = await step_file_index(ctx)

    await step_manifest(ctx)

    const tree = await step_tree(ctx, file_index)
    const classified_index = await step_classify(ctx, file_index)
    const domains = await step_domains(ctx, classified_index, tree)
    const final_domains = await step_domain_review(ctx, domains, classified_index, tree)

    await step_extraction_plan(ctx, final_domains, classified_index)

    const arch_md = await step_architecture(ctx, classified_index, final_domains, tree)

    await step_learnings(ctx, arch_md)

    // Mark survey complete
    mark_phase_completed(phase)
    await write_state(output_dir, state)

    log_success('Survey phase completed')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    log_error(`Survey failed: ${message}`)
    mark_phase_failed(phase)
    await write_state(output_dir, state)
    throw err
  }
}

///////////////////////////////////////////////////////////////////// Helpers //

/**
 * Classifies files in batches using Claude.
 */
const classify_files = async (
  file_index: FileIndex,
  config: FaultlineConfig,
  output_dir: string
): Promise<FileIndex> => {
  const batches = pack_batches(file_index, CLASSIFY_BATCH_SIZE)
  const classified: FileIndex = []

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]

    log_debug(`Classifying batch ${i + 1}/${batches.length} (${batch.length} files)`)

    const file_list = batch.map(f =>
      `${f.path} (${f.extension}, ${f.size_bytes}b, ~${f.tokens_est} tokens)`
    ).join('\n')

    const system_prompt = await load_prompt('survey/classify.md')

    const spinner = create_spinner(`Classifying batch ${i + 1}/${batches.length}`)

    try {
      const result = await invoke_claude({
        model: config.survey_model,
        system_prompt,
        input: file_list,
        timeout: config.timeout,
        max_retries: config.max_retries,
        output_dir,
        phase: 'survey',
        task: `classify_batch_${i}`,
        verbose: config.verbose,
        json_schema: CLASSIFY_FILES_SCHEMA
      })

      spinner.stop()

      const classifications = JSON.parse(result.result) as
        Array<{ path: string, language: string, category: string }>

      // Merge classifications back into file entries
      const class_map = new Map(classifications.map(c => [c.path, c]))

      for (const entry of batch) {
        const cls = class_map.get(entry.path)

        classified.push({
          ...entry,
          language: cls?.language ?? entry.language,
          category: (cls?.category ?? entry.category) as FileIndex[number]['category']
        })
      }
    } catch (classification_error) {
      spinner.stop()

      // On classification failure, keep existing categorization
      log_debug(
        `Classification batch ${i + 1} failed (${classification_error}), keeping defaults`
      )
      classified.push(...batch)
    }
  }

  return classified
}

/**
 * Maps files to domains using Claude.
 */
const map_domains = async (
  file_index: FileIndex,
  tree: string,
  config: FaultlineConfig,
  output_dir: string
): Promise<Domain[]> => {
  // Build compressed directory-level summary
  const dir_summary = build_directory_summary(file_index)

  const system_prompt = await load_prompt('survey/domains.md')
  const input = [
    '## Directory Summary',
    dir_summary,
    '',
    '## File Tree',
    tree
  ].join('\n')

  const spinner = create_spinner('Mapping domains')

  try {
    const result = await invoke_claude({
      model: config.survey_model,
      system_prompt,
      input,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'survey',
      task: 'domain_mapping',
      verbose: config.verbose,
      json_schema: MAP_DOMAINS_SCHEMA
    })

    spinner.stop()

    return JSON.parse(result.result) as Domain[]
  } catch (err) {
    spinner.stop()
    throw err
  }
}

/**
 * Performs adversarial review of domain assignments.
 */
const review_domains = async (
  domains: Domain[],
  file_index: FileIndex,
  config: FaultlineConfig,
  output_dir: string
): Promise<DomainReview> => {
  const system_prompt = await load_prompt('survey/review.md')
  const input = JSON.stringify({
    domains,
    file_count: file_index.length,
    total_tokens: file_index.reduce((sum, f) => sum + f.tokens_est, 0),
    directories: [...new Set(file_index.map(f => f.path.split('/')[0]))]
  }, null, 2)

  const spinner = create_spinner('Reviewing domains')

  try {
    const result = await invoke_claude({
      model: config.review_model,
      system_prompt,
      input,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'survey',
      task: 'domain_review',
      verbose: config.verbose,
      json_schema: DOMAIN_REVIEW_SCHEMA
    })

    spinner.stop()

    return JSON.parse(result.result) as DomainReview
  } catch (err) {
    spinner.stop()
    throw err
  }
}

/**
 * Retries domain mapping with review feedback.
 */
const retry_domain_mapping = async (
  file_index: FileIndex,
  tree: string,
  review: DomainReview,
  config: FaultlineConfig,
  output_dir: string
): Promise<Domain[]> => {
  const dir_summary = build_directory_summary(file_index)

  const system_prompt = await load_prompt('survey/domains.md')
  const input = [
    '## Directory Summary',
    dir_summary,
    '',
    '## File Tree',
    tree,
    '',
    '## Previous Review Feedback',
    '### Issues',
    ...review.issues.map(i => `- ${i}`),
    '',
    '### Suggestions',
    ...review.suggestions.map(s => `- ${s}`)
  ].join('\n')

  const spinner = create_spinner('Retrying domain mapping with feedback')

  try {
    const result = await invoke_claude({
      model: config.survey_model,
      system_prompt,
      input,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'survey',
      task: 'domain_mapping_retry',
      verbose: config.verbose,
      json_schema: MAP_DOMAINS_SCHEMA
    })

    spinner.stop()

    return JSON.parse(result.result) as Domain[]
  } catch (err) {
    spinner.stop()
    throw err
  }
}

/**
 * Generates the architecture description using Claude.
 */
const describe_architecture = async (
  file_index: FileIndex,
  domains: Domain[],
  tree: string,
  config: FaultlineConfig,
  output_dir: string
): Promise<string> => {
  const system_prompt = await load_prompt('survey/architecture.md')
  const input = JSON.stringify({
    domains,
    file_count: file_index.length,
    total_tokens: file_index.reduce((sum, f) => sum + f.tokens_est, 0),
    tree: tree.slice(0, 5000), // Truncate tree for context budget
    top_level_dirs: [...new Set(file_index.map(f => f.path.split('/')[0]))]
  }, null, 2)

  const spinner = create_spinner('Generating architecture description')

  try {
    const result = await invoke_claude({
      model: config.survey_model,
      system_prompt,
      input,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'survey',
      task: 'architecture',
      verbose: config.verbose
    })

    spinner.stop()

    return extract_markdown_body(result.result)
  } catch (err) {
    spinner.stop()
    throw err
  }
}

/**
 * Extracts initial learnings from the architecture description. Looks for
 * cross-cutting observations marked with specific patterns.
 */
const extract_architecture_learnings = (arch_md: string): LearningEntry[] => {
  const learnings: LearningEntry[] = []
  const lines = arch_md.split('\n')
  let in_crosscutting = false

  for (const line of lines) {
    if (line.match(/#+\s*cross.cutting/i)) {
      in_crosscutting = true
      continue
    }

    if (in_crosscutting && line.match(/^#+\s/) && !line.match(/#+\s*cross.cutting/i)) {
      in_crosscutting = false
      continue
    }

    if (in_crosscutting && line.trim().startsWith('-')) {
      const content = line.trim().replace(/^-\s*/, '')

      if (content.length > 10) {
        learnings.push({
          id: `arch_${learnings.length}`,
          type: 'observation',
          domain: 'cross-cutting',
          content,
          source_phase: 'survey',
          created_at: new Date().toISOString(),
          tokens_est: Math.ceil(content.length / 4)
        })
      }
    }
  }

  // If no structured cross-cutting section found, create a single learning
  // from the whole document
  if (learnings.length === 0 && arch_md.length > 0) {
    const summary = arch_md.slice(0, 500)

    learnings.push({
      id: 'arch_0',
      type: 'observation',
      domain: 'cross-cutting',
      content: `Architecture overview: ${summary}`,
      source_phase: 'survey',
      created_at: new Date().toISOString(),
      tokens_est: Math.ceil(summary.length / 4)
    })
  }

  return learnings
}

/**
 * Builds a compressed directory-level summary for domain mapping.
 * Groups files by directory and shows file counts + token totals.
 */
const build_directory_summary = (file_index: FileIndex): string => {
  const dirs: Record<string, { count: number, tokens: number, extensions: Set<string> }> = {}

  for (const entry of file_index) {
    const parts = entry.path.split('/')
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.'

    if (!dirs[dir]) {
      dirs[dir] = { count: 0, tokens: 0, extensions: new Set() }
    }

    dirs[dir].count++
    dirs[dir].tokens += entry.tokens_est
    dirs[dir].extensions.add(entry.extension)
  }

  return Object.entries(dirs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, info]) => {
      const exts = Array.from(info.extensions).join(', ')

      return `${dir}/ — ${info.count} files, ~${info.tokens} tokens [${exts}]`
    })
    .join('\n')
}
