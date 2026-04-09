import { join } from 'node:path'

import { walk_files, generate_tree } from '../file_walker.js'
import { parse_manifest } from '../manifest_parser.js'
import { pack_batches, build_extraction_tasks } from '../batcher.js'
import { invoke_claude } from '../claude/invoke.js'
import { load_prompt } from '../claude/prompt_loader.js'
import { extract_json_block, extract_markdown_body } from '../claude/response_parser.js'
import {
  write_file_index,
  write_manifest,
  write_tree,
  write_domains,
  write_domain_review,
  write_extraction_plan,
  write_architecture,
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
  Domain,
  DomainReview,
  ExtractionPlan,
  LearningEntry
} from '../../types.js'

///////////////////////////////////////////////////////////////// Constants //

const CLASSIFY_BATCH_SIZE = 8_000

///////////////////////////////////////////////////////////////////////// API //

/**
 * Execute Survey
 *
 * Runs the full survey pipeline: file indexing, manifest parsing, tree
 * generation, file classification, domain mapping, domain review, extraction
 * plan generation, and architecture description.
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

  try {
    // Step 1a: File indexing (harness-only)
    log_step('1a', 'Indexing files')
    update_task_status(phase, 'file_index', 'File indexing', 'running')
    await write_state(output_dir, state)

    const file_index = await walk_files(
      config.target_dir,
      config.include,
      config.exclude
    )

    await write_file_index(output_dir, file_index)
    log_success(`Indexed ${file_index.length} files`)
    update_task_status(phase, 'file_index', 'File indexing', 'completed')

    // Step 1a': Manifest parsing
    log_step('1a\'', 'Parsing dependency manifest')
    update_task_status(phase, 'manifest', 'Manifest parsing', 'running')
    await write_state(output_dir, state)

    const manifest = await parse_manifest(config.target_dir)

    if (manifest) {
      await write_manifest(output_dir, manifest)
      log_success(
        `Parsed manifest: ${manifest.name}@${manifest.version} ` +
        `(${manifest.dependencies.length} dependencies)`
      )
    } else {
      log_info('No recognized dependency manifest found')
    }

    update_task_status(phase, 'manifest', 'Manifest parsing', 'completed')

    // Step 1a'': Tree generation
    log_step('1a\'\'', 'Generating directory tree')
    update_task_status(phase, 'tree', 'Tree generation', 'running')
    await write_state(output_dir, state)

    const tree = generate_tree(file_index)

    await write_tree(output_dir, tree)
    log_success('Generated directory tree')
    update_task_status(phase, 'tree', 'Tree generation', 'completed')

    // Step 1b: File classification (Claude)
    log_step('1b', 'Classifying files')
    update_task_status(phase, 'classify', 'File classification', 'running')
    await write_state(output_dir, state)

    const classified_index = await classify_files(
      file_index,
      config,
      output_dir
    )

    await write_file_index(output_dir, classified_index)
    log_success('Files classified')
    update_task_status(phase, 'classify', 'File classification', 'completed')

    // Step 1c: Domain mapping (Claude)
    log_step('1c', 'Mapping domains')
    update_task_status(phase, 'domains', 'Domain mapping', 'running')
    await write_state(output_dir, state)

    const domains = await map_domains(classified_index, tree, config, output_dir)

    await write_domains(output_dir, domains)
    log_success(`Mapped ${domains.length} domains`)
    update_task_status(phase, 'domains', 'Domain mapping', 'completed')

    // Step 1c': Domain review (Claude, adversarial)
    log_step('1c\'', 'Reviewing domains')
    update_task_status(phase, 'domain_review', 'Domain review', 'running')
    await write_state(output_dir, state)

    const review = await review_domains(
      domains,
      classified_index,
      config,
      output_dir
    )

    await write_domain_review(output_dir, review)

    if (!review.passed) {
      log_info('Domain review found issues, retrying domain mapping with feedback')

      const retry_domains = await retry_domain_mapping(
        classified_index,
        tree,
        review,
        config,
        output_dir
      )

      await write_domains(output_dir, retry_domains)

      const retry_review = await review_domains(
        retry_domains,
        classified_index,
        config,
        output_dir
      )

      await write_domain_review(output_dir, retry_review)
      log_success(
        `Domain review ${retry_review.passed ? 'passed' : 'completed with remaining issues'}`
      )
    } else {
      log_success('Domain review passed')
    }

    update_task_status(phase, 'domain_review', 'Domain review', 'completed')

    // Read final domains for subsequent steps
    const final_domains = domains

    // Step 1d: Extraction plan (harness-only)
    log_step('1d', 'Generating extraction plan')
    update_task_status(phase, 'extraction_plan', 'Extraction plan', 'running')
    await write_state(output_dir, state)

    const tasks = build_extraction_tasks(
      final_domains,
      classified_index,
      config.context_budget
    )

    const plan: ExtractionPlan = {
      context_budget: config.context_budget,
      total_batches: tasks.length,
      tasks
    }

    await write_extraction_plan(output_dir, plan)
    log_success(`Generated extraction plan with ${tasks.length} batches`)
    update_task_status(phase, 'extraction_plan', 'Extraction plan', 'completed')

    // Step 1e: Architecture description (Claude)
    log_step('1e', 'Generating architecture description')
    update_task_status(phase, 'architecture', 'Architecture description', 'running')
    await write_state(output_dir, state)

    const arch_md = await describe_architecture(
      classified_index,
      final_domains,
      tree,
      config,
      output_dir
    )

    await write_architecture(output_dir, arch_md)
    log_success('Generated architecture description')
    update_task_status(phase, 'architecture', 'Architecture description', 'completed')

    // Step 1e': Extract learnings from architecture
    log_step('1e\'', 'Extracting learnings')
    update_task_status(phase, 'learnings', 'Learnings extraction', 'running')
    await write_state(output_dir, state)

    const learnings = extract_architecture_learnings(arch_md)

    await append_learnings(output_dir, learnings)
    log_success(`Extracted ${learnings.length} learnings`)
    update_task_status(phase, 'learnings', 'Learnings extraction', 'completed')

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
        verbose: config.verbose
      })

      spinner.stop()

      const classifications = extract_json_block<
        Array<{ path: string, language: string, category: string }>
      >(result.stdout)

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
      verbose: config.verbose
    })

    spinner.stop()

    return extract_json_block<Domain[]>(result.stdout)
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
      verbose: config.verbose
    })

    spinner.stop()

    return extract_json_block<DomainReview>(result.stdout)
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
      verbose: config.verbose
    })

    spinner.stop()

    return extract_json_block<Domain[]>(result.stdout)
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

    return extract_markdown_body(result.stdout)
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
