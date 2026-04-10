import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

import { invoke_claude } from '../claude/invoke.js'
import { load_prompt } from '../claude/prompt_loader.js'
import { extract_markdown_body } from '../claude/response_parser.js'
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
  read_manifest,
  read_architecture,
  read_consolidated_notes,
  read_cross_references,
  write_output_file,
  copy_output_to_ridgeline,
  write_domain_summaries
} from '../../stores/index.js'
import { read_active_learnings } from '../../stores/learnings.js'
import {
  log_info,
  log_success,
  log_error,
  log_warn,
  log_step,
  create_spinner
} from '../../ui/index.js'
import type {
  FaultlineConfig,
  Domain,
  DomainSummary,
  CrossReferenceReport,
  CrossReferenceFinding,
  Manifest
} from '../../types.js'

///////////////////////////////////////////////////////////////// Constants //

const ARCHITECTURE_DIGEST_CHARS = 4_000
const ABSTRACTION_LONG_IDENTIFIER_LENGTH = 15

///////////////////////////////////////////////////////////////////////// API //

/**
 * Execute Synthesize
 *
 * Runs the full synthesis pipeline: domain summary compression, per-domain
 * spec writing with abstraction enforcement, overview generation, architecture
 * refinement, constraints extraction, and taste extraction.
 *
 * @param config - The resolved faultline configuration.
 */
export const execute_synthesize = async (config: FaultlineConfig): Promise<void> => {
  const output_dir = join(config.target_dir, config.output_dir)

  let state = await read_state(output_dir)

  if (!state) {
    state = init_state(config.target_dir)
  }

  if (!is_phase_completed(state, 'extract')) {
    throw new Error(
      'Extract phase must be completed before synthesis. Run `faultline extract` first.'
    )
  }

  // Check reconciliation unless skipped
  if (!config.skip_reconcile && !is_phase_completed(state, 'reconcile')) {
    throw new Error(
      'Reconcile phase must be completed before synthesis. ' +
      'Run `faultline reconcile` first, or use --skip-reconcile.'
    )
  }

  // Load artifacts
  const domains = await read_domains(output_dir)
  const manifest = await read_manifest(output_dir)
  const architecture_raw = await read_architecture(output_dir)

  if (!domains) {
    throw new Error('Survey artifacts missing (domains.json)')
  }

  const architecture_digest = architecture_raw
    ? truncate_to_budget(architecture_raw, ARCHITECTURE_DIGEST_CHARS)
    : 'No architecture description available.'

  const cross_refs = await read_cross_references(output_dir)
  const learnings = await read_active_learnings(output_dir)
  const learnings_text = learnings.entries.length > 0
    ? learnings.entries.map(l => `- [${l.type}] ${l.content}`).join('\n')
    : 'No learnings available.'

  // Initialize synthesize phase
  const phase = get_or_create_phase(state, 'synthesize')

  phase.status = 'running'
  phase.started_at = phase.started_at ?? new Date().toISOString()
  await write_state(output_dir, state)

  try {
    // Step 3a: Domain summary compression
    log_step('3a', 'Compressing domain summaries')
    const summaries = await compress_domain_summaries(
      domains,
      config,
      output_dir
    )

    await write_domain_summaries(output_dir, summaries)

    update_task_status(phase, 'summarize', 'Domain summaries', 'completed')
    await write_state(output_dir, state)

    const all_summaries_text = summaries
      .map(s => `**${s.label}** (${s.domain_id}): ${s.summary}`)
      .join('\n\n')

    // Step 3b: Per-domain spec writing
    log_step('3b', 'Writing domain specs')
    const framework_keywords = manifest
      ? extract_framework_keywords(manifest)
      : []

    for (const domain of domains) {
      const task_id = `spec_${domain.id}`

      update_task_status(phase, task_id, `Spec: ${domain.label}`, 'running')
      await write_state(output_dir, state)

      await write_domain_spec(
        domain,
        summaries,
        all_summaries_text,
        architecture_digest,
        cross_refs,
        learnings_text,
        framework_keywords,
        manifest,
        config,
        output_dir
      )

      update_task_status(phase, task_id, `Spec: ${domain.label}`, 'completed')
      await write_state(output_dir, state)
    }

    // Step 3c: Overview spec
    log_step('3c', 'Writing overview spec')
    update_task_status(phase, 'overview', 'Overview spec', 'running')
    await write_state(output_dir, state)

    await write_overview_spec(
      all_summaries_text,
      architecture_digest,
      cross_refs,
      learnings_text,
      config,
      output_dir
    )

    update_task_status(phase, 'overview', 'Overview spec', 'completed')
    await write_state(output_dir, state)

    // Step 3d: Architecture refinement
    log_step('3d', 'Refining architecture')
    update_task_status(phase, 'architecture', 'Architecture', 'running')
    await write_state(output_dir, state)

    await write_architecture_spec(
      architecture_raw ?? '',
      all_summaries_text,
      cross_refs,
      learnings_text,
      config,
      output_dir
    )

    update_task_status(phase, 'architecture', 'Architecture', 'completed')
    await write_state(output_dir, state)

    // Step 3e: Constraints extraction
    log_step('3e', 'Extracting constraints')
    update_task_status(phase, 'constraints', 'Constraints', 'running')
    await write_state(output_dir, state)

    await write_constraints_spec(
      manifest,
      architecture_digest,
      all_summaries_text,
      config,
      output_dir
    )

    update_task_status(phase, 'constraints', 'Constraints', 'completed')
    await write_state(output_dir, state)

    // Step 3f: Taste extraction
    log_step('3f', 'Extracting taste')
    update_task_status(phase, 'taste', 'Taste', 'running')
    await write_state(output_dir, state)

    await write_taste_spec(
      all_summaries_text,
      config,
      output_dir
    )

    update_task_status(phase, 'taste', 'Taste', 'completed')
    await write_state(output_dir, state)

    // Copy to ridgeline if requested
    if (config.ridgeline_name) {
      log_step('3g', `Copying output to .ridgeline/builds/${config.ridgeline_name}/`)
      await copy_output_to_ridgeline(config.target_dir, output_dir, config.ridgeline_name)
    }

    mark_phase_completed(phase)
    await write_state(output_dir, state)
    log_success('Synthesis phase completed')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    log_error(`Synthesis failed: ${message}`)
    mark_phase_failed(phase)
    await write_state(output_dir, state)
    throw err
  }
}

///////////////////////////////////////////////////////////////////// Helpers //

/**
 * Compresses each domain's consolidated notes into a ~500-token summary.
 */
const compress_domain_summaries = async (
  domains: Domain[],
  config: FaultlineConfig,
  output_dir: string
): Promise<DomainSummary[]> => {
  const summaries: DomainSummary[] = []

  for (const domain of domains) {
    const notes = await read_consolidated_notes(output_dir, domain.id)

    if (!notes) {
      summaries.push({
        domain_id: domain.id,
        label: domain.label,
        summary: `${domain.label}: ${domain.description}`,
        tokens_est: Math.ceil(domain.description.length / 4)
      })
      continue
    }

    const system_prompt = await load_prompt('synthesize/summarize.md', {
      domain_label: domain.label,
      domain_description: domain.description,
      consolidated_notes: notes
    })

    const spinner = create_spinner(`Summarizing ${domain.label}`)

    try {
      const result = await invoke_claude({
        model: config.model,
        system_prompt,
        input: notes,
        timeout: config.timeout,
        max_retries: config.max_retries,
        output_dir,
        phase: 'synthesize',
        task: `summarize_${domain.id}`,
        verbose: config.verbose
      })

      spinner.stop()

      const summary = extract_markdown_body(result.result)

      summaries.push({
        domain_id: domain.id,
        label: domain.label,
        summary,
        tokens_est: Math.ceil(summary.length / 4)
      })
    } catch (err) {
      spinner.stop()
      log_warn(
        `Summary failed for ${domain.label}: ` +
        `${err instanceof Error ? err.message : String(err)}`
      )

      summaries.push({
        domain_id: domain.id,
        label: domain.label,
        summary: `${domain.label}: ${domain.description}`,
        tokens_est: Math.ceil(domain.description.length / 4)
      })
    }
  }

  return summaries
}

/**
 * Writes spec file(s) for a single domain. Handles multi-file splitting and
 * harness-level abstraction enforcement.
 */
const write_domain_spec = async (
  domain: Domain,
  _summaries: DomainSummary[],
  all_summaries_text: string,
  architecture_digest: string,
  cross_refs: CrossReferenceReport | null,
  learnings_text: string,
  framework_keywords: string[],
  manifest: Manifest | null,
  config: FaultlineConfig,
  output_dir: string
): Promise<void> => {
  const notes = await read_consolidated_notes(output_dir, domain.id)

  if (!notes) {
    log_warn(`No consolidated notes for ${domain.label}, writing placeholder spec`)
    await write_output_file(
      output_dir,
      `specs/${domain.id}/01-${domain.id}.md`,
      `# ${domain.label}\n\nNo extraction data available for this domain.\n`
    )
    return
  }

  // Get cross-reference findings mentioning this domain
  const domain_findings = cross_refs
    ? get_domain_findings(cross_refs, domain.id)
    : []

  const cross_ref_text = domain_findings.length > 0
    ? domain_findings.map(f =>
      `- [${f.type}] ${f.description} (hint: ${f.resolution_hint})`
    ).join('\n')
    : 'No cross-reference findings for this domain.'

  const system_prompt = await load_prompt('synthesize/spec.md', {
    domain_label: domain.label,
    domain_description: domain.description,
    consolidated_notes: notes,
    all_summaries: all_summaries_text,
    architecture_digest,
    cross_references: cross_ref_text,
    learnings: learnings_text
  })

  const spinner = create_spinner(`Writing spec for ${domain.label}`)

  try {
    const result = await invoke_claude({
      model: config.model,
      system_prompt,
      input: notes,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'synthesize',
      task: `spec_${domain.id}`,
      verbose: config.verbose
    })

    spinner.stop()

    let spec_content = extract_markdown_body(result.result)

    // Parse for multi-file splits
    const specs = parse_spec_splits(spec_content, domain.id)

    // Step 3b': Abstraction enforcement scan on each spec
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i]
      const violations = scan_abstraction_violations(
        spec.content,
        framework_keywords,
        manifest
      )

      if (violations.length > 0) {
        log_info(
          `Abstraction violations in ${spec.filename}: ${violations.length} found, rewriting`
        )

        const rewritten = await rewrite_with_feedback(
          spec.content,
          violations,
          domain,
          config,
          output_dir
        )

        // Rescan after rewrite
        const remaining = scan_abstraction_violations(
          rewritten,
          framework_keywords,
          manifest
        )

        if (remaining.length > 0) {
          log_warn(
            `${remaining.length} abstraction violation(s) remain in ` +
            `${spec.filename} after rewrite: ${remaining.slice(0, 3).join('; ')}`
          )
        }

        specs[i] = { ...spec, content: rewritten }
      }

      // Write the spec file
      await write_output_file(output_dir, `specs/${domain.id}/${spec.filename}`, specs[i].content)
    }
  } catch (err) {
    spinner.stop()
    log_error(
      `Spec writing failed for ${domain.label}: ` +
      `${err instanceof Error ? err.message : String(err)}`
    )
    throw err
  }
}

/**
 * Parses Claude's spec output for SPEC_SPLIT delimiters. If none found,
 * wraps the entire output as a single spec file.
 */
export const parse_spec_splits = (
  content: string,
  domain_id: string
): Array<{ filename: string, content: string }> => {
  const split_regex = /---SPEC_SPLIT:\s*(.+?)---/g
  const matches = [...content.matchAll(split_regex)]

  if (matches.length === 0) {
    return [{ filename: `01-${domain_id}.md`, content }]
  }

  const specs: Array<{ filename: string, content: string }> = []

  for (let i = 0; i < matches.length; i++) {
    const filename = matches[i][1].trim()
    const start = matches[i].index! + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index! : content.length
    const section = content.slice(start, end).trim()

    specs.push({ filename, content: section })
  }

  return specs
}

/**
 * Scans a spec file for abstraction violations: file extensions, framework
 * names, long camelCase/snake_case identifiers, and path-like strings.
 */
export const scan_abstraction_violations = (
  content: string,
  framework_keywords: string[],
  _manifest: Manifest | null
): string[] => {
  const violations: string[] = []

  // Check file extensions
  const ext_pattern = /\b\w+\.(ts|js|py|rb|go|rs|java|cpp|cs|php|swift|kt)\b/g
  const ext_matches = content.match(ext_pattern)

  if (ext_matches) {
    const unique = [...new Set(ext_matches)]

    violations.push(`File extensions found: ${unique.slice(0, 5).join(', ')}`)
  }

  // Check framework names from manifest
  for (const keyword of framework_keywords) {
    // Case-insensitive word boundary match
    const regex = new RegExp(`\\b${escape_regex(keyword)}\\b`, 'i')

    if (regex.test(content)) {
      violations.push(`Framework/library reference: "${keyword}"`)
    }
  }

  // Check long camelCase identifiers (>15 chars)
  const camel_pattern = /\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g
  const camel_matches = content.match(camel_pattern) ?? []
  const long_camel = camel_matches.filter(
    m => m.length > ABSTRACTION_LONG_IDENTIFIER_LENGTH
  )

  if (long_camel.length > 0) {
    violations.push(
      `Long camelCase identifiers: ${[...new Set(long_camel)].slice(0, 5).join(', ')}`
    )
  }

  // Check long snake_case identifiers (>15 chars)
  const snake_pattern = /\b[a-z][a-z0-9]*(_[a-z0-9]+){2,}\b/g
  const snake_matches = content.match(snake_pattern) ?? []
  const long_snake = snake_matches.filter(
    m => m.length > ABSTRACTION_LONG_IDENTIFIER_LENGTH
  )

  if (long_snake.length > 0) {
    violations.push(
      `Long snake_case identifiers: ${[...new Set(long_snake)].slice(0, 5).join(', ')}`
    )
  }

  // Check path-like strings
  const path_pattern = /\b(src\/|lib\/|\.\/|app\/|internal\/|pkg\/)/g
  const path_matches = content.match(path_pattern)

  if (path_matches) {
    violations.push(
      `Path-like strings found: ${[...new Set(path_matches)].join(', ')}`
    )
  }

  return violations
}

/**
 * Resubmits a spec to Claude with violation feedback for cleanup.
 */
const rewrite_with_feedback = async (
  spec_content: string,
  violations: string[],
  domain: Domain,
  config: FaultlineConfig,
  output_dir: string
): Promise<string> => {
  const feedback = [
    '# Abstraction Violation Feedback',
    '',
    'The following implementation-specific references were detected in your spec.',
    'Rewrite the spec to remove all of these while preserving the meaning:',
    '',
    ...violations.map(v => `- ${v}`),
    '',
    '## Rules',
    '',
    '- Replace file extensions with descriptive terms (e.g., "source module" not "app.ts")',
    '- Replace framework names with functional descriptions',
    '- Replace code identifiers with product-level descriptions',
    '- Replace file paths with component/domain references',
    '- Keep all other content intact'
  ].join('\n')

  const spinner = create_spinner(`Rewriting ${domain.label} spec for abstraction compliance`)

  try {
    const result = await invoke_claude({
      model: config.model,
      system_prompt: feedback,
      input: spec_content,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'synthesize',
      task: `rewrite_${domain.id}`,
      verbose: config.verbose
    })

    spinner.stop()

    return extract_markdown_body(result.result)
  } catch (err) {
    spinner.stop()
    log_warn(
      `Rewrite failed for ${domain.label}: ` +
      `${err instanceof Error ? err.message : String(err)}`
    )

    return spec_content
  }
}

/**
 * Writes the overview spec (00-overview.md) documenting system-wide invariants.
 */
const write_overview_spec = async (
  all_summaries_text: string,
  architecture_digest: string,
  cross_refs: CrossReferenceReport | null,
  learnings_text: string,
  config: FaultlineConfig,
  output_dir: string
): Promise<void> => {
  // Extract shared invariants from cross-references
  const shared_invariants = cross_refs
    ? cross_refs.clusters
      .flatMap(c => c.findings)
      .filter(f => f.type === 'shared_invariant')
      .map(f => `- ${f.description} (affects: ${f.affected_domains.join(', ')})`)
      .join('\n')
    : 'No shared invariants identified (reconciliation not run or no findings).'

  const system_prompt = await load_prompt('synthesize/overview.md', {
    all_summaries: all_summaries_text,
    architecture_digest,
    shared_invariants: shared_invariants || 'No shared invariants identified.',
    learnings: learnings_text
  })

  const spinner = create_spinner('Writing overview spec')

  try {
    const result = await invoke_claude({
      model: config.model,
      system_prompt,
      input: all_summaries_text,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'synthesize',
      task: 'overview',
      verbose: config.verbose
    })

    spinner.stop()

    const content = extract_markdown_body(result.result)

    await write_output_file(output_dir, 'specs/00-overview.md', content)
  } catch (err) {
    spinner.stop()
    throw err
  }
}

/**
 * Writes the refined architecture spec.
 */
const write_architecture_spec = async (
  current_architecture: string,
  all_summaries_text: string,
  cross_refs: CrossReferenceReport | null,
  learnings_text: string,
  config: FaultlineConfig,
  output_dir: string
): Promise<void> => {
  const cross_ref_text = cross_refs
    ? cross_refs.clusters
      .flatMap(c => c.findings)
      .map(f => `- [${f.type}] ${f.description}`)
      .join('\n')
    : 'No cross-reference data available.'

  const system_prompt = await load_prompt('synthesize/architecture.md', {
    current_architecture: current_architecture || 'No prior architecture description.',
    all_summaries: all_summaries_text,
    cross_references: cross_ref_text,
    learnings: learnings_text
  })

  const spinner = create_spinner('Refining architecture')

  try {
    const result = await invoke_claude({
      model: config.model,
      system_prompt,
      input: all_summaries_text,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'synthesize',
      task: 'architecture',
      verbose: config.verbose
    })

    spinner.stop()

    const content = extract_markdown_body(result.result)

    await write_output_file(output_dir, 'architecture.md', content)
  } catch (err) {
    spinner.stop()
    throw err
  }
}

/**
 * Writes the constraints spec from manifest and configs.
 */
const write_constraints_spec = async (
  manifest: Manifest | null,
  architecture_digest: string,
  all_summaries_text: string,
  config: FaultlineConfig,
  output_dir: string
): Promise<void> => {
  const manifest_text = manifest
    ? JSON.stringify(manifest, null, 2)
    : 'No manifest available.'

  // Try to load config files from the target codebase
  const config_files = await load_config_files(config.target_dir)

  const system_prompt = await load_prompt('synthesize/constraints.md', {
    manifest: manifest_text,
    config_files,
    architecture_digest,
    all_summaries: all_summaries_text
  })

  const spinner = create_spinner('Extracting constraints')

  try {
    const result = await invoke_claude({
      model: config.model,
      system_prompt,
      input: manifest_text,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'synthesize',
      task: 'constraints',
      verbose: config.verbose
    })

    spinner.stop()

    const content = extract_markdown_body(result.result)

    await write_output_file(output_dir, 'constraints.md', content)
  } catch (err) {
    spinner.stop()
    throw err
  }
}

/**
 * Writes the taste spec from linter configs and source samples.
 */
const write_taste_spec = async (
  all_summaries_text: string,
  config: FaultlineConfig,
  output_dir: string
): Promise<void> => {
  const linter_configs = await load_linter_configs(config.target_dir)
  const source_samples = await load_source_samples(config.target_dir)

  const system_prompt = await load_prompt('synthesize/taste.md', {
    linter_configs,
    source_samples,
    all_summaries: all_summaries_text
  })

  const spinner = create_spinner('Extracting taste')

  try {
    const result = await invoke_claude({
      model: config.model,
      system_prompt,
      input: source_samples,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'synthesize',
      task: 'taste',
      verbose: config.verbose
    })

    spinner.stop()

    const content = extract_markdown_body(result.result)

    await write_output_file(output_dir, 'taste.md', content)
  } catch (err) {
    spinner.stop()
    throw err
  }
}

/**
 * Gets cross-reference findings that mention a specific domain.
 */
const get_domain_findings = (
  report: CrossReferenceReport,
  domain_id: string
): CrossReferenceFinding[] => {
  return report.clusters
    .flatMap(c => c.findings)
    .filter(f => f.affected_domains.includes(domain_id))
}

/**
 * Extracts framework keywords from the manifest for abstraction scanning.
 */
const extract_framework_keywords = (manifest: Manifest): string[] => {
  const keywords: string[] = []

  for (const dep of manifest.dependencies) {
    keywords.push(dep.name)

    const short = dep.name.replace(/^@[^/]+\//, '')

    if (short !== dep.name) {
      keywords.push(short)
    }
  }

  return [...new Set(keywords)]
}

/**
 * Loads well-known config files from the target codebase for constraints
 * extraction.
 */
const load_config_files = async (target_dir: string): Promise<string> => {
  const config_patterns = [
    'tsconfig.json',
    '.eslintrc.json',
    '.eslintrc.js',
    '.prettierrc',
    '.prettierrc.json',
    'jest.config.js',
    'jest.config.ts',
    'vite.config.ts',
    'vite.config.js',
    'webpack.config.js',
    'docker-compose.yml',
    'Dockerfile'
  ]

  const parts: string[] = []

  for (const pattern of config_patterns) {
    const path = join(target_dir, pattern)

    if (existsSync(path)) {
      try {
        const content = await readFile(path, 'utf-8')
        const truncated = truncate_to_budget(content, 2_000)

        parts.push(`--- ${pattern} ---\n${truncated}`)
      } catch {
        // Skip unreadable files
      }
    }
  }

  return parts.length > 0
    ? parts.join('\n\n')
    : 'No configuration files found.'
}

/**
 * Loads linter configuration files for taste extraction.
 */
const load_linter_configs = async (target_dir: string): Promise<string> => {
  const linter_files = [
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.yml',
    'eslint.config.js',
    'eslint.config.mjs',
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.yml',
    '.prettierrc.js',
    '.editorconfig',
    '.stylelintrc.json',
    'biome.json',
    'oxlint.json',
    '.oxlintrc.json'
  ]

  const parts: string[] = []

  for (const file of linter_files) {
    const path = join(target_dir, file)

    if (existsSync(path)) {
      try {
        const content = await readFile(path, 'utf-8')

        parts.push(`--- ${file} ---\n${truncate_to_budget(content, 2_000)}`)
      } catch {
        // Skip
      }
    }
  }

  return parts.length > 0
    ? parts.join('\n\n')
    : 'No linter configuration files found.'
}

/**
 * Loads a few representative source files for taste extraction.
 */
const load_source_samples = async (target_dir: string): Promise<string> => {
  // Try common entry points and representative files
  const candidates = [
    'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js',
    'src/app.ts', 'src/app.js', 'src/server.ts', 'src/server.js',
    'index.ts', 'index.js', 'app.ts', 'app.js',
    'lib/index.ts', 'lib/index.js'
  ]

  const parts: string[] = []
  let samples_loaded = 0
  const max_samples = 3

  for (const candidate of candidates) {
    if (samples_loaded >= max_samples) break

    const path = join(target_dir, candidate)

    if (existsSync(path)) {
      try {
        const content = await readFile(path, 'utf-8')

        parts.push(`--- ${candidate} ---\n${truncate_to_budget(content, 3_000)}`)
        samples_loaded++
      } catch {
        // Skip
      }
    }
  }

  return parts.length > 0
    ? parts.join('\n\n')
    : 'No representative source files found.'
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
 * Escapes a string for use in a RegExp constructor.
 */
const escape_regex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
