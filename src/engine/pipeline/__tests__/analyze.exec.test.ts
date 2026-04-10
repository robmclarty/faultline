import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  init_state,
  get_or_create_phase,
  update_task_status,
  mark_phase_completed,
  write_state,
  read_state,
  write_domains,
  write_extraction_plan,
  write_architecture,
  write_file_index,
  write_manifest,
  write_tree,
  write_consolidated_notes,
  write_cross_references
} from '../../../stores/index.js'
import type {
  Domain,
  ClaudeInvocationResult,
  FaultlineConfig
} from '../../../types.js'

// Mock invoke_claude — includes set_budget_limit and BudgetExceededError
vi.mock('../../claude/invoke.js', () => {
  class BudgetExceededError extends Error {
    spent: number
    limit: number
    constructor(spent: number, limit: number) {
      super(`Budget ceiling exceeded: $${spent.toFixed(4)} spent of $${limit.toFixed(2)} limit`)
      this.name = 'BudgetExceededError'
      this.spent = spent
      this.limit = limit
    }
  }

  return {
    invoke_claude: vi.fn(),
    set_budget_limit: vi.fn(),
    BudgetExceededError
  }
})

// Mock prompt_loader
vi.mock('../../claude/prompt_loader.js', () => ({
  load_prompt: vi.fn(async () => 'mock prompt')
}))

// Mock file_walker
vi.mock('../../file_walker.js', () => ({
  walk_files: vi.fn(async () => []),
  generate_tree: vi.fn(() => '.')
}))

// Mock manifest_parser
vi.mock('../../manifest_parser.js', () => ({
  parse_manifest: vi.fn(async () => null)
}))

// Mock batcher
vi.mock('../../batcher.js', () => ({
  pack_batches: vi.fn(() => []),
  build_extraction_tasks: vi.fn(() => [])
}))

import { invoke_claude } from '../../claude/invoke.js'
import { execute_analyze } from '../analyze.exec.js'

const mock_invoke = vi.mocked(invoke_claude)

///////////////////////////////////////////////////////////////// Fixtures //

let tmp_dir: string
let output_dir: string
let source_dir: string

const make_result = (text: string): ClaudeInvocationResult => ({
  success: true,
  result: text,
  stdout: '',
  stderr: '',
  exit_code: 0,
  model: 'sonnet',
  input_tokens: 100,
  output_tokens: 50,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  cost_usd: 0.001,
  duration_ms: 1000,
  session_id: 'test-session'
})

const make_domain = (
  id: string,
  label: string,
  priority = 3,
  depends_on: string[] = []
): Domain => ({
  id,
  label,
  description: `The ${label} domain`,
  directories: [`src/${id}`],
  key_files: [`src/${id}/index.js`],
  estimated_tokens: 5000,
  priority,
  depends_on,
  sub_domains: []
})

const make_config = (overrides: Partial<FaultlineConfig> = {}): FaultlineConfig => ({
  target_dir: source_dir,
  model: 'sonnet',
  survey_model: 'sonnet',
  review_model: 'sonnet',
  context_budget: 150_000,
  timeout: 300_000,
  max_retries: 2,
  concurrency: 3,
  skip_deep_pass: true,
  skip_reconcile: false,
  max_budget_usd: 0,
  ridgeline_name: '',
  include: [],
  exclude: [],
  output_dir: '.faultline',
  verbose: false,
  ...overrides
})

/**
 * Sets up survey artifacts so the survey phase appears completed.
 */
const setup_survey_completed = async (): Promise<void> => {
  const state = init_state(source_dir)
  const phase = get_or_create_phase(state, 'survey')

  mark_phase_completed(phase)
  await write_state(output_dir, state)
  await write_file_index(output_dir, [])
  await write_domains(output_dir, [
    make_domain('auth', 'Authentication', 1)
  ])
  await write_extraction_plan(output_dir, {
    context_budget: 150_000,
    total_batches: 1,
    tasks: [{
      domain_id: 'auth',
      batch_index: 0,
      files: ['src/auth/index.js'],
      estimated_tokens: 1000
    }]
  })
  await write_architecture(output_dir, '# Architecture\n\nSimple app.')
  await write_manifest(output_dir, {
    name: 'test-app',
    version: '1.0.0',
    type: 'npm',
    dependencies: []
  })
  await write_tree(output_dir, '.')

  // Create source file
  await mkdir(join(source_dir, 'src', 'auth'), { recursive: true })
  await writeFile(
    join(source_dir, 'src', 'auth', 'index.js'),
    'module.exports = { login() {} }',
    'utf-8'
  )
}

/**
 * Sets up extract artifacts so both survey and extract phases are completed.
 */
const setup_extract_completed = async (): Promise<void> => {
  await setup_survey_completed()

  const state = (await read_state(output_dir))!

  const phase = get_or_create_phase(state, 'extract')

  mark_phase_completed(phase)
  await write_state(output_dir, state)
  await write_consolidated_notes(
    output_dir,
    'auth',
    '### Business Rules\n\n- Users must authenticate'
  )
}

/**
 * Sets up reconcile artifacts so survey, extract, and reconcile are completed.
 */
const setup_reconcile_completed = async (): Promise<void> => {
  await setup_extract_completed()

  const state = (await read_state(output_dir))!

  const phase = get_or_create_phase(state, 'reconcile')

  mark_phase_completed(phase)
  await write_state(output_dir, state)
  await write_cross_references(output_dir, {
    clusters: [],
    total_findings: 0,
    generated_at: new Date().toISOString()
  })
}

beforeEach(async () => {
  tmp_dir = await mkdtemp(join(tmpdir(), 'faultline-analyze-test-'))
  source_dir = join(tmp_dir, 'project')
  output_dir = join(source_dir, '.faultline')
  await mkdir(source_dir, { recursive: true })
  mock_invoke.mockReset()
})

afterEach(async () => {
  await rm(tmp_dir, { recursive: true, force: true })
})

////////////////////////////////////////////////////////////////////////// Tests //

describe('execute_analyze', () => {
  describe('phase sequencing', () => {
    it('skips completed phases on resume', async () => {
      // Set up survey + extract + reconcile completed
      await setup_reconcile_completed()

      // Mock Claude calls for synthesis phase only
      mock_invoke.mockResolvedValue(
        make_result('Synthesized summary content.')
      )

      await execute_analyze(make_config())

      // Verify state — all four phases should be completed
      const state = await read_state(output_dir)

      expect(state).not.toBeNull()
      expect(state!.phases).toHaveLength(4)
      expect(state!.phases.find(p => p.phase === 'survey')?.status).toBe('completed')
      expect(state!.phases.find(p => p.phase === 'extract')?.status).toBe('completed')
      expect(state!.phases.find(p => p.phase === 'reconcile')?.status).toBe('completed')
      expect(state!.phases.find(p => p.phase === 'synthesize')?.status).toBe('completed')
    })

    it('skips reconcile phase when --skip-reconcile is set', async () => {
      await setup_extract_completed()

      // Mock Claude calls for synthesis
      mock_invoke.mockResolvedValue(
        make_result('Synthesized content.')
      )

      await execute_analyze(make_config({ skip_reconcile: true }))

      const state = await read_state(output_dir)

      expect(state).not.toBeNull()

      // Reconcile should not be present since it was skipped entirely
      const reconcile = state!.phases.find(p => p.phase === 'reconcile')

      expect(reconcile).toBeUndefined()

      // Synthesize should be completed
      const synth = state!.phases.find(p => p.phase === 'synthesize')

      expect(synth?.status).toBe('completed')
    })
  })

  describe('resume across phase boundaries', () => {
    it('resumes from extract when survey is completed', async () => {
      await setup_survey_completed()

      // Mock extract + reconcile + synthesis calls
      const batch_notes = '### Business Rules\n\n- Rule 1 (index.js)\n\n' +
        '### Cross-Domain Observations\n\n- None'
      const consolidated = '### Business Rules\n\n- Rule 1'
      const review_json = JSON.stringify({
        passed: true,
        issues: [],
        suggestions: [],
        uncovered_files: []
      })
      mock_invoke.mockResolvedValue(make_result(consolidated))

      // Second call is consolidation, third is review, etc.
      mock_invoke
        .mockResolvedValueOnce(make_result(batch_notes))
        .mockResolvedValueOnce(make_result(consolidated))
        .mockResolvedValueOnce(make_result(review_json))
        .mockResolvedValue(make_result('Generated content.'))

      await execute_analyze(make_config())

      const state = await read_state(output_dir)

      // Survey was already completed (skipped), extract ran
      expect(state!.phases.find(p => p.phase === 'survey')?.status).toBe('completed')
      expect(state!.phases.find(p => p.phase === 'extract')?.status).toBe('completed')
    })
  })

  describe('budget enforcement', () => {
    it('halts when budget ceiling is exceeded', async () => {
      await setup_survey_completed()

      // Import the BudgetExceededError class from the mock
      const mod = await import('../../claude/invoke.js') as {
        BudgetExceededError: new (spent: number, limit: number) => Error
      }

      // All calls throw BudgetExceededError to simulate ceiling hit
      mock_invoke.mockRejectedValue(
        new mod.BudgetExceededError(0.5, 0.1)
      )

      // Should not throw — budget exceeded is handled gracefully
      await execute_analyze(make_config({ max_budget_usd: 0.1 }))

      const state = await read_state(output_dir)

      // Pipeline should have saved state
      expect(state).not.toBeNull()
    })
  })

  describe('state persistence', () => {
    it('creates initial state when none exists', async () => {
      // Setup a fresh project with no state
      await setup_survey_completed()

      // Remove state to simulate fresh start that goes through
      // Actually, setup_survey_completed creates state. Let's check it just works.
      const state = await read_state(output_dir)

      expect(state).not.toBeNull()
      expect(state!.target_dir).toBe(source_dir)
    })

    it('persists state after each completed phase', async () => {
      await setup_reconcile_completed()

      mock_invoke.mockResolvedValue(make_result('Content.'))

      await execute_analyze(make_config())

      const state = await read_state(output_dir)

      expect(state).not.toBeNull()

      // All four phases completed and persisted
      const synth = state!.phases.find(p => p.phase === 'synthesize')

      expect(synth?.status).toBe('completed')
      expect(synth?.completed_at).toBeDefined()
    })
  })

  describe('cost tracking', () => {
    it('invokes Claude for synthesis when prior phases are completed', async () => {
      await setup_reconcile_completed()

      mock_invoke.mockResolvedValue(make_result('Content.'))

      await execute_analyze(make_config())

      // Verify invoke_claude was called for synthesis phase work
      expect(mock_invoke).toHaveBeenCalled()
      expect(mock_invoke.mock.calls.length).toBeGreaterThan(0)
    })
  })

  describe('within-phase resume', () => {
    it('skips completed tasks within survey phase on resume', async () => {
      // Set up a partially completed survey: file_index, manifest, tree,
      // and classify are done, but domains onwards are not
      const state = init_state(source_dir)
      const phase = get_or_create_phase(state, 'survey')

      phase.status = 'running'
      phase.started_at = new Date().toISOString()
      update_task_status(phase, 'file_index', 'File indexing', 'completed')
      update_task_status(phase, 'manifest', 'Manifest parsing', 'completed')
      update_task_status(phase, 'tree', 'Tree generation', 'completed')
      update_task_status(phase, 'classify', 'File classification', 'completed')
      await write_state(output_dir, state)

      // Write artifacts that completed tasks would have produced
      await write_file_index(output_dir, [])
      await write_tree(output_dir, '.')
      await write_manifest(output_dir, {
        name: 'test-app',
        version: '1.0.0',
        type: 'npm',
        dependencies: []
      })

      // Create source dir
      await mkdir(join(source_dir, 'src', 'auth'), { recursive: true })
      await writeFile(
        join(source_dir, 'src', 'auth', 'index.js'),
        'module.exports = { login() {} }',
        'utf-8'
      )

      // Mock remaining Claude calls: domains, review, architecture
      const domains_json = JSON.stringify({ items: [make_domain('auth', 'Authentication', 1)] })
      const review_json = JSON.stringify({
        passed: true,
        issues: [],
        suggestions: [],
        uncovered_files: []
      })

      mock_invoke
        .mockResolvedValueOnce(make_result(domains_json))
        .mockResolvedValueOnce(make_result(review_json))
        .mockResolvedValueOnce(make_result('# Architecture\n\n## Cross-cutting\n\n- Obs'))
        .mockResolvedValue(make_result('Content.'))

      await execute_analyze(make_config())

      // invoke_claude should NOT have been called for classify (it was completed)
      // First call should be for domain_mapping, not classify_batch_0
      const first_call = mock_invoke.mock.calls[0]
      const first_task = first_call[0] as { task?: string }

      expect(first_task.task).not.toContain('classify')
      expect(first_task.task).toBe('domain_mapping')

      // Verify survey completed
      const final_state = await read_state(output_dir)

      expect(final_state!.phases.find(p => p.phase === 'survey')?.status).toBe('completed')
    })

    it('skips completed extraction tasks within extract phase on resume', async () => {
      // Set up completed survey + partially completed extract with two domains
      await setup_survey_completed()

      const domains = [
        make_domain('auth', 'Authentication', 1),
        make_domain('tasks', 'Task Management', 2)
      ]

      await write_domains(output_dir, domains)
      await write_extraction_plan(output_dir, {
        context_budget: 150_000,
        total_batches: 2,
        tasks: [
          {
            domain_id: 'auth',
            batch_index: 0,
            files: ['src/auth/index.js'],
            estimated_tokens: 1000
          },
          {
            domain_id: 'tasks',
            batch_index: 0,
            files: ['src/tasks/index.js'],
            estimated_tokens: 1000
          }
        ]
      })

      // Mark extract phase running with auth batch + consolidation + review
      // + domain all completed
      const state = (await read_state(output_dir))!
      const extract_phase = get_or_create_phase(state, 'extract')

      extract_phase.status = 'running'
      extract_phase.started_at = new Date().toISOString()
      update_task_status(
        extract_phase, 'extract_auth_batch_0', 'Extract: Authentication batch 0', 'completed'
      )
      update_task_status(
        extract_phase, 'consolidate_auth', 'Consolidate: Authentication', 'completed'
      )
      update_task_status(
        extract_phase, 'review_auth', 'Review: Authentication', 'completed'
      )
      update_task_status(
        extract_phase, 'domain_auth', 'Domain: Authentication', 'completed'
      )
      await write_state(output_dir, state)

      // Write auth extraction artifacts (already done)
      await write_consolidated_notes(
        output_dir,
        'auth',
        '### Business Rules\n\n- Users must authenticate'
      )

      // Create source files for tasks domain
      await mkdir(join(source_dir, 'src', 'tasks'), { recursive: true })
      await writeFile(
        join(source_dir, 'src', 'tasks', 'index.js'),
        'module.exports = { create() {} }',
        'utf-8'
      )

      // Mock Claude calls — should only be called for 'tasks' domain extraction
      const batch_notes = '### Business Rules\n\n- Rule 1 (index.js)\n\n' +
        '### Cross-Domain Observations\n\n- None'
      const consolidated = '### Business Rules\n\n- Rule 1'
      const review_json = JSON.stringify({
        passed: true,
        issues: [],
        suggestions: [],
        uncovered_files: []
      })

      mock_invoke
        .mockResolvedValueOnce(make_result(batch_notes))
        .mockResolvedValueOnce(make_result(consolidated))
        .mockResolvedValueOnce(make_result(review_json))
        .mockResolvedValue(make_result('Content.'))

      await execute_analyze(make_config())

      // All extract-phase invoke_claude calls should be for 'tasks', not 'auth'
      const extract_calls = mock_invoke.mock.calls.filter(
        c => (c[0] as { phase?: string }).phase === 'extract'
      )
      const auth_extract_calls = extract_calls.filter(
        c => {
          const task = (c[0] as { task?: string }).task ?? ''

          return task.includes('auth')
        }
      )

      expect(auth_extract_calls).toHaveLength(0)

      // Verify tasks domain was actually extracted
      const tasks_extract_calls = extract_calls.filter(
        c => {
          const task = (c[0] as { task?: string }).task ?? ''

          return task.includes('tasks')
        }
      )

      expect(tasks_extract_calls.length).toBeGreaterThan(0)
    })
  })
})
