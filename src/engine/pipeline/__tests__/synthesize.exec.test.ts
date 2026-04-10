import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'

import {
  init_state,
  get_or_create_phase,
  mark_phase_completed,
  write_state,
  read_state,
  write_domains,
  write_architecture,
  write_manifest,
  write_consolidated_notes,
  write_cross_references,
  read_domain_summaries,
  read_output_file
} from '../../../stores/index.js'
import type {
  Domain,
  ClaudeInvocationResult,
  FaultlineConfig,
  CrossReferenceReport
} from '../../../types.js'

// Mock invoke_claude
vi.mock('../../claude/invoke.js', () => ({
  invoke_claude: vi.fn()
}))

// Mock prompt_loader
vi.mock('../../claude/prompt_loader.js', () => ({
  load_prompt: vi.fn(async (_path: string, vars?: Record<string, string>) => {
    return `mock prompt: ${_path} vars=${JSON.stringify(vars ?? {})}`
  })
}))

import { invoke_claude } from '../../claude/invoke.js'
import { execute_synthesize, parse_spec_splits, scan_abstraction_violations } from '../synthesize.exec.js'

const mock_invoke = vi.mocked(invoke_claude)

///////////////////////////////////////////////////////////////// Fixtures //

let tmp_dir: string
let output_dir: string
let source_dir: string

const make_result = (text: string): ClaudeInvocationResult => ({
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
  skip_deep_pass: false,
  skip_reconcile: false,
  ridgeline_name: '',
  include: [],
  exclude: [],
  output_dir: '.faultline',
  verbose: false,
  ...overrides
})

const CONSOLIDATED_AUTH = `### Business Rules

- Users must authenticate before accessing resources
- Passwords require minimum 8 characters

### Data Invariants

- User IDs are unique identifiers

### Cross-Domain Observations

- Auth provides user identity to task management`

const CONSOLIDATED_TASKS = `### Business Rules

- Tasks must be owned by an authenticated user

### Data Invariants

- Task IDs are unique identifiers

### Cross-Domain Observations

- Tasks depend on auth for user verification`

const DOMAIN_SUMMARY = 'Authentication handles user identity, login, registration, and session management.'

const SPEC_CONTENT = `## Overview

The authentication domain manages user identity.

## Requirements

### Identity Management

- Users can register with email and password
- Users can log in with valid credentials

## Known Gaps

- Rate limiting strategy is unclear

## Relationships

- Provides user identity to task management`

const SPEC_WITH_SPLITS = `---SPEC_SPLIT: 01-identity.md---
## Overview

Identity management handles user registration.

## Requirements

- Users can register

---SPEC_SPLIT: 02-sessions.md---
## Overview

Session management handles login/logout.

## Requirements

- Users can log in`

const OVERVIEW_CONTENT = `## System Purpose

A task management system.

## System-Wide Invariants

- All entities use unique identifiers

## Domain Map

- Authentication: manages user identity
- Task Management: manages tasks`

const ARCHITECTURE_CONTENT = `## Components

The system has two main components.

## Data Flows

Users authenticate then manage tasks.`

const CONSTRAINTS_CONTENT = `## Runtime Constraints

- Requires a web server runtime

## Data Constraints

- All identifiers must be unique`

const TASTE_CONTENT = `## Naming Conventions

- Variables use descriptive names

## Formatting

- 2-space indentation`

const CROSS_REF_REPORT: CrossReferenceReport = {
  clusters: [{
    domains: ['auth', 'tasks'],
    findings: [{
      type: 'shared_invariant',
      description: 'All entities use unique identifiers',
      affected_domains: ['auth', 'tasks'],
      resolution_hint: 'Document in overview'
    }]
  }],
  total_findings: 1,
  generated_at: new Date().toISOString()
}

///////////////////////////////////////////////////////////////////// Setup //

beforeEach(async () => {
  vi.clearAllMocks()

  tmp_dir = await mkdtemp(join(tmpdir(), 'faultline-synth-test-'))
  source_dir = tmp_dir
  output_dir = join(tmp_dir, '.faultline')

  await mkdir(output_dir, { recursive: true })

  // Set up completed survey, extract, and reconcile state
  const state = init_state(source_dir)

  for (const phase_name of ['survey', 'extract', 'reconcile'] as const) {
    const p = get_or_create_phase(state, phase_name)

    mark_phase_completed(p)
  }

  await write_state(output_dir, state)
})

afterEach(async () => {
  await rm(tmp_dir, { recursive: true, force: true })
})

///////////////////////////////////////////////////////////////////// Tests //

describe('execute_synthesize', () => {
  it('fails if extract phase is not completed', async () => {
    const state = init_state(source_dir)
    const survey_phase = get_or_create_phase(state, 'survey')

    mark_phase_completed(survey_phase)
    await write_state(output_dir, state)

    await expect(execute_synthesize(make_config())).rejects.toThrow(
      'Extract phase must be completed'
    )
  })

  it('fails if reconcile is not completed and not skipped', async () => {
    const state = init_state(source_dir)

    for (const name of ['survey', 'extract'] as const) {
      const p = get_or_create_phase(state, name)

      mark_phase_completed(p)
    }

    await write_state(output_dir, state)

    await expect(execute_synthesize(make_config())).rejects.toThrow(
      'Reconcile phase must be completed'
    )
  })

  it('proceeds without reconcile when --skip-reconcile is set', async () => {
    const state = init_state(source_dir)

    for (const name of ['survey', 'extract'] as const) {
      const p = get_or_create_phase(state, name)

      mark_phase_completed(p)
    }

    await write_state(output_dir, state)

    await write_domains(output_dir, [make_domain('auth', 'Authentication')])
    await write_consolidated_notes(output_dir, 'auth', CONSOLIDATED_AUTH)
    await write_architecture(output_dir, '# Architecture')

    // summarize + spec + overview + architecture + constraints + taste = 6
    mock_invoke
      .mockResolvedValueOnce(make_result(DOMAIN_SUMMARY))
      .mockResolvedValueOnce(make_result(SPEC_CONTENT))
      .mockResolvedValueOnce(make_result(OVERVIEW_CONTENT))
      .mockResolvedValueOnce(make_result(ARCHITECTURE_CONTENT))
      .mockResolvedValueOnce(make_result(CONSTRAINTS_CONTENT))
      .mockResolvedValueOnce(make_result(TASTE_CONTENT))

    await execute_synthesize(make_config({ skip_reconcile: true }))

    const state2 = await read_state(output_dir)
    const synth_phase = state2!.phases.find(p => p.phase === 'synthesize')

    expect(synth_phase!.status).toBe('completed')
  })

  describe('with full pipeline artifacts', () => {
    beforeEach(async () => {
      await write_domains(output_dir, [
        make_domain('auth', 'Authentication', 1, []),
        make_domain('tasks', 'Task Management', 2, ['auth'])
      ])
      await write_consolidated_notes(output_dir, 'auth', CONSOLIDATED_AUTH)
      await write_consolidated_notes(output_dir, 'tasks', CONSOLIDATED_TASKS)
      await write_architecture(output_dir, '# Architecture\n\nTwo-tier system')
      await write_cross_references(output_dir, CROSS_REF_REPORT)
    })

    it('produces domain_summaries.json with one summary per domain', async () => {
      // 2 summaries + 2 specs + overview + arch + constraints + taste = 8
      mock_invoke
        .mockResolvedValueOnce(make_result(DOMAIN_SUMMARY))
        .mockResolvedValueOnce(make_result(DOMAIN_SUMMARY))
        .mockResolvedValueOnce(make_result(SPEC_CONTENT))
        .mockResolvedValueOnce(make_result(SPEC_CONTENT))
        .mockResolvedValueOnce(make_result(OVERVIEW_CONTENT))
        .mockResolvedValueOnce(make_result(ARCHITECTURE_CONTENT))
        .mockResolvedValueOnce(make_result(CONSTRAINTS_CONTENT))
        .mockResolvedValueOnce(make_result(TASTE_CONTENT))

      await execute_synthesize(make_config())

      const summaries = await read_domain_summaries(output_dir)

      expect(summaries).not.toBeNull()
      expect(summaries!.length).toBe(2)
      expect(summaries!.map(s => s.domain_id)).toEqual(['auth', 'tasks'])
    })

    it('produces spec files under specs/<domain>/', async () => {
      mock_invoke
        .mockResolvedValueOnce(make_result(DOMAIN_SUMMARY))
        .mockResolvedValueOnce(make_result(DOMAIN_SUMMARY))
        .mockResolvedValueOnce(make_result(SPEC_CONTENT))
        .mockResolvedValueOnce(make_result(SPEC_CONTENT))
        .mockResolvedValueOnce(make_result(OVERVIEW_CONTENT))
        .mockResolvedValueOnce(make_result(ARCHITECTURE_CONTENT))
        .mockResolvedValueOnce(make_result(CONSTRAINTS_CONTENT))
        .mockResolvedValueOnce(make_result(TASTE_CONTENT))

      await execute_synthesize(make_config())

      const auth_spec = await read_output_file(output_dir, 'specs/auth/01-auth.md')

      expect(auth_spec).not.toBeNull()
      expect(auth_spec).toContain('authentication domain')

      const tasks_spec = await read_output_file(output_dir, 'specs/tasks/01-tasks.md')

      expect(tasks_spec).not.toBeNull()
    })

    it('produces 00-overview.md', async () => {
      mock_invoke
        .mockResolvedValueOnce(make_result(DOMAIN_SUMMARY))
        .mockResolvedValueOnce(make_result(DOMAIN_SUMMARY))
        .mockResolvedValueOnce(make_result(SPEC_CONTENT))
        .mockResolvedValueOnce(make_result(SPEC_CONTENT))
        .mockResolvedValueOnce(make_result(OVERVIEW_CONTENT))
        .mockResolvedValueOnce(make_result(ARCHITECTURE_CONTENT))
        .mockResolvedValueOnce(make_result(CONSTRAINTS_CONTENT))
        .mockResolvedValueOnce(make_result(TASTE_CONTENT))

      await execute_synthesize(make_config())

      const overview = await read_output_file(output_dir, 'specs/00-overview.md')

      expect(overview).not.toBeNull()
      expect(overview).toContain('System Purpose')
    })

    it('produces architecture.md, constraints.md, and taste.md', async () => {
      mock_invoke
        .mockResolvedValueOnce(make_result(DOMAIN_SUMMARY))
        .mockResolvedValueOnce(make_result(DOMAIN_SUMMARY))
        .mockResolvedValueOnce(make_result(SPEC_CONTENT))
        .mockResolvedValueOnce(make_result(SPEC_CONTENT))
        .mockResolvedValueOnce(make_result(OVERVIEW_CONTENT))
        .mockResolvedValueOnce(make_result(ARCHITECTURE_CONTENT))
        .mockResolvedValueOnce(make_result(CONSTRAINTS_CONTENT))
        .mockResolvedValueOnce(make_result(TASTE_CONTENT))

      await execute_synthesize(make_config())

      const arch = await read_output_file(output_dir, 'architecture.md')
      const constraints = await read_output_file(output_dir, 'constraints.md')
      const taste = await read_output_file(output_dir, 'taste.md')

      expect(arch).not.toBeNull()
      expect(constraints).not.toBeNull()
      expect(taste).not.toBeNull()
    })

    it('updates state.json after each synthesis step', async () => {
      mock_invoke
        .mockResolvedValueOnce(make_result(DOMAIN_SUMMARY))
        .mockResolvedValueOnce(make_result(DOMAIN_SUMMARY))
        .mockResolvedValueOnce(make_result(SPEC_CONTENT))
        .mockResolvedValueOnce(make_result(SPEC_CONTENT))
        .mockResolvedValueOnce(make_result(OVERVIEW_CONTENT))
        .mockResolvedValueOnce(make_result(ARCHITECTURE_CONTENT))
        .mockResolvedValueOnce(make_result(CONSTRAINTS_CONTENT))
        .mockResolvedValueOnce(make_result(TASTE_CONTENT))

      await execute_synthesize(make_config())

      const state = await read_state(output_dir)
      const synth_phase = state!.phases.find(p => p.phase === 'synthesize')

      expect(synth_phase!.status).toBe('completed')

      const task_ids = synth_phase!.tasks.map(t => t.id)

      expect(task_ids).toContain('summarize')
      expect(task_ids).toContain('spec_auth')
      expect(task_ids).toContain('spec_tasks')
      expect(task_ids).toContain('overview')
      expect(task_ids).toContain('architecture')
      expect(task_ids).toContain('constraints')
      expect(task_ids).toContain('taste')
    })

    it('copies output to ridgeline when --ridgeline is specified', async () => {
      mock_invoke
        .mockResolvedValueOnce(make_result(DOMAIN_SUMMARY))
        .mockResolvedValueOnce(make_result(DOMAIN_SUMMARY))
        .mockResolvedValueOnce(make_result(SPEC_CONTENT))
        .mockResolvedValueOnce(make_result(SPEC_CONTENT))
        .mockResolvedValueOnce(make_result(OVERVIEW_CONTENT))
        .mockResolvedValueOnce(make_result(ARCHITECTURE_CONTENT))
        .mockResolvedValueOnce(make_result(CONSTRAINTS_CONTENT))
        .mockResolvedValueOnce(make_result(TASTE_CONTENT))

      await execute_synthesize(make_config({ ridgeline_name: 'test-build' }))

      const ridgeline_dir = join(source_dir, '.ridgeline', 'builds', 'test-build')

      expect(existsSync(ridgeline_dir)).toBe(true)

      const overview_path = join(ridgeline_dir, 'specs', '00-overview.md')

      expect(existsSync(overview_path)).toBe(true)
    })
  })

  describe('abstraction enforcement', () => {
    beforeEach(async () => {
      await write_domains(output_dir, [make_domain('auth', 'Authentication')])
      await write_consolidated_notes(output_dir, 'auth', CONSOLIDATED_AUTH)
      await write_architecture(output_dir, '# Architecture')
      await write_cross_references(output_dir, {
        clusters: [],
        total_findings: 0,
        generated_at: new Date().toISOString()
      })
    })

    it('triggers rewrite when spec contains framework references', async () => {
      await write_manifest(output_dir, {
        name: 'test-app',
        version: '1.0.0',
        type: 'npm',
        dependencies: [
          { name: 'express', version: '4.0.0', dev: false }
        ]
      })

      const spec_with_violations = SPEC_CONTENT +
        '\n\nThe Express middleware handles authentication via passport.js'

      // summary + spec-with-violations + rewrite + overview + arch + constraints + taste
      mock_invoke
        .mockResolvedValueOnce(make_result(DOMAIN_SUMMARY))
        .mockResolvedValueOnce(make_result(spec_with_violations))
        .mockResolvedValueOnce(make_result(SPEC_CONTENT)) // rewrite
        .mockResolvedValueOnce(make_result(OVERVIEW_CONTENT))
        .mockResolvedValueOnce(make_result(ARCHITECTURE_CONTENT))
        .mockResolvedValueOnce(make_result(CONSTRAINTS_CONTENT))
        .mockResolvedValueOnce(make_result(TASTE_CONTENT))

      await execute_synthesize(make_config())

      // Should have 7 calls including the rewrite
      expect(mock_invoke).toHaveBeenCalledTimes(7)

      // The rewrite call should have 'rewrite' in the task
      const rewrite_call = mock_invoke.mock.calls.find(
        c => c[0].task.includes('rewrite')
      )

      expect(rewrite_call).toBeDefined()
    })
  })
})

describe('parse_spec_splits', () => {
  it('returns single spec when no splits present', () => {
    const specs = parse_spec_splits(SPEC_CONTENT, 'auth')

    expect(specs.length).toBe(1)
    expect(specs[0].filename).toBe('01-auth.md')
    expect(specs[0].content).toBe(SPEC_CONTENT)
  })

  it('splits on SPEC_SPLIT delimiters', () => {
    const specs = parse_spec_splits(SPEC_WITH_SPLITS, 'auth')

    expect(specs.length).toBe(2)
    expect(specs[0].filename).toBe('01-identity.md')
    expect(specs[1].filename).toBe('02-sessions.md')
    expect(specs[0].content).toContain('Identity management')
    expect(specs[1].content).toContain('Session management')
  })
})

describe('scan_abstraction_violations', () => {
  it('detects file extensions', () => {
    const violations = scan_abstraction_violations(
      'The app.ts file handles routing',
      [],
      null
    )

    expect(violations.some(v => v.includes('File extensions'))).toBe(true)
  })

  it('detects framework keywords', () => {
    const violations = scan_abstraction_violations(
      'Express handles HTTP requests',
      ['express'],
      null
    )

    expect(violations.some(v => v.includes('express'))).toBe(true)
  })

  it('detects long camelCase identifiers', () => {
    const violations = scan_abstraction_violations(
      'The handleUserAuthentication method processes login',
      [],
      null
    )

    expect(violations.some(v => v.includes('camelCase'))).toBe(true)
  })

  it('detects path-like strings', () => {
    const violations = scan_abstraction_violations(
      'The module at src/auth handles login',
      [],
      null
    )

    expect(violations.some(v => v.includes('Path-like'))).toBe(true)
  })

  it('returns empty array for clean content', () => {
    const violations = scan_abstraction_violations(
      'Users can register and log in. Sessions expire after a set duration.',
      [],
      null
    )

    expect(violations.length).toBe(0)
  })

  it('detects long snake_case identifiers', () => {
    const violations = scan_abstraction_violations(
      'The handle_user_auth_request function processes login',
      [],
      null
    )

    expect(violations.some(v => v.includes('snake_case'))).toBe(true)
  })
})
