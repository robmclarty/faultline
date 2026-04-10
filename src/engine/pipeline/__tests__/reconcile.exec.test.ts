import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  init_state,
  get_or_create_phase,
  mark_phase_completed,
  write_state,
  read_state,
  write_domains,
  write_consolidated_notes,
  read_cross_references
} from '../../../stores/index.js'
import { read_active_learnings } from '../../../stores/learnings.js'
import type {
  Domain,
  ClaudeInvocationResult,
  FaultlineConfig,
  CrossReferenceFinding
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
import { execute_reconcile } from '../reconcile.exec.js'
import {
  build_interaction_graph,
  identify_clusters
} from '../reconcile.exec.js'

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

const CONSOLIDATED_AUTH = `### Business Rules Observed

- Users must authenticate before accessing any resource
- Passwords require minimum 8 characters
- Session tokens expire after 24 hours

### Data Invariants

- User IDs are UUID v4 format

### Gaps & Ambiguities

- Rate limiting strategy for login attempts is unclear

### Cross-Domain Observations

- Auth provides user identity to the tasks domain`

const CONSOLIDATED_TASKS = `### Business Rules Observed

- Tasks must be owned by an authenticated user
- Task status transitions: draft -> active -> completed

### Data Invariants

- Task IDs are UUID v4 format
- User IDs are UUID v4 format

### Gaps & Ambiguities

- Bulk task deletion behavior is undefined

### Cross-Domain Observations

- Tasks depend on auth for user identity verification`

const CONSOLIDATED_CONFIG = `### Business Rules Observed

- Configuration is loaded at startup

### Data Invariants

- Config values are immutable after initialization

### Gaps & Ambiguities

- Hot reload behavior is undefined

### Cross-Domain Observations

- No cross-domain dependencies observed`

const RECONCILIATION_FINDINGS: CrossReferenceFinding[] = [
  {
    type: 'shared_invariant',
    description: 'All entities use UUID v4 identifiers',
    affected_domains: ['auth', 'tasks'],
    resolution_hint: 'Document in system overview'
  },
  {
    type: 'missing_handoff',
    description: 'Auth-to-tasks user identity handoff not explicitly documented',
    affected_domains: ['auth', 'tasks'],
    resolution_hint: 'Define user identity contract'
  }
]

///////////////////////////////////////////////////////////////////// Setup //

beforeEach(async () => {
  vi.clearAllMocks()

  tmp_dir = await mkdtemp(join(tmpdir(), 'faultline-reconcile-test-'))
  source_dir = tmp_dir
  output_dir = join(tmp_dir, '.faultline')

  await mkdir(output_dir, { recursive: true })

  // Set up completed survey and extract state
  const state = init_state(source_dir)
  const survey_phase = get_or_create_phase(state, 'survey')

  mark_phase_completed(survey_phase)

  const extract_phase = get_or_create_phase(state, 'extract')

  mark_phase_completed(extract_phase)
  await write_state(output_dir, state)
})

afterEach(async () => {
  await rm(tmp_dir, { recursive: true, force: true })
})

///////////////////////////////////////////////////////////////////// Tests //

describe('execute_reconcile', () => {
  it('fails if extract phase is not completed', async () => {
    const state = init_state(source_dir)
    const survey_phase = get_or_create_phase(state, 'survey')

    mark_phase_completed(survey_phase)
    await write_state(output_dir, state)

    await expect(execute_reconcile(make_config())).rejects.toThrow(
      'Extract phase must be completed'
    )
  })

  it('produces cross_references.json with findings organized by cluster', async () => {
    const domains = [
      make_domain('auth', 'Authentication', 1, []),
      make_domain('tasks', 'Task Management', 2, ['auth'])
    ]

    await write_domains(output_dir, domains)
    await write_consolidated_notes(output_dir, 'auth', CONSOLIDATED_AUTH)
    await write_consolidated_notes(output_dir, 'tasks', CONSOLIDATED_TASKS)

    mock_invoke.mockResolvedValueOnce(
      make_result(JSON.stringify(RECONCILIATION_FINDINGS))
    )

    await execute_reconcile(make_config())

    const report = await read_cross_references(output_dir)

    expect(report).not.toBeNull()
    expect(report!.clusters.length).toBe(1)
    expect(report!.clusters[0].findings.length).toBe(2)
    expect(report!.total_findings).toBe(2)

    const finding_types = report!.clusters[0].findings.map(f => f.type)

    expect(finding_types).toContain('shared_invariant')
    expect(finding_types).toContain('missing_handoff')
  })

  it('skips isolated domains with no cross-domain edges', async () => {
    const domains = [
      make_domain('auth', 'Authentication', 1, []),
      make_domain('tasks', 'Task Management', 2, ['auth']),
      make_domain('config', 'Configuration', 5, [])
    ]

    await write_domains(output_dir, domains)
    await write_consolidated_notes(output_dir, 'auth', CONSOLIDATED_AUTH)
    await write_consolidated_notes(output_dir, 'tasks', CONSOLIDATED_TASKS)
    await write_consolidated_notes(output_dir, 'config', CONSOLIDATED_CONFIG)

    mock_invoke.mockResolvedValueOnce(
      make_result(JSON.stringify(RECONCILIATION_FINDINGS))
    )

    await execute_reconcile(make_config())

    const report = await read_cross_references(output_dir)

    expect(report).not.toBeNull()

    // Config should be isolated — not in any cluster
    const all_domains_in_clusters = report!.clusters.flatMap(c => c.domains)

    expect(all_domains_in_clusters).not.toContain('config')

    // Only one Claude call for the auth-tasks cluster
    expect(mock_invoke).toHaveBeenCalledTimes(1)
  })

  it('appends reconciliation findings to learnings', async () => {
    const domains = [
      make_domain('auth', 'Authentication', 1, []),
      make_domain('tasks', 'Task Management', 2, ['auth'])
    ]

    await write_domains(output_dir, domains)
    await write_consolidated_notes(output_dir, 'auth', CONSOLIDATED_AUTH)
    await write_consolidated_notes(output_dir, 'tasks', CONSOLIDATED_TASKS)

    mock_invoke.mockResolvedValueOnce(
      make_result(JSON.stringify(RECONCILIATION_FINDINGS))
    )

    await execute_reconcile(make_config())

    const learnings = await read_active_learnings(output_dir)

    expect(learnings.entries.length).toBeGreaterThan(0)

    const reconcile_learnings = learnings.entries.filter(
      e => e.source_phase === 'reconcile'
    )

    expect(reconcile_learnings.length).toBe(2)
  })

  it('updates state.json after reconciliation', async () => {
    const domains = [
      make_domain('auth', 'Authentication', 1, []),
      make_domain('tasks', 'Task Management', 2, ['auth'])
    ]

    await write_domains(output_dir, domains)
    await write_consolidated_notes(output_dir, 'auth', CONSOLIDATED_AUTH)
    await write_consolidated_notes(output_dir, 'tasks', CONSOLIDATED_TASKS)

    mock_invoke.mockResolvedValueOnce(
      make_result(JSON.stringify([]))
    )

    await execute_reconcile(make_config())

    const state = await read_state(output_dir)
    const phase = state!.phases.find(p => p.phase === 'reconcile')

    expect(phase).toBeDefined()
    expect(phase!.status).toBe('completed')
  })
})

describe('build_interaction_graph', () => {
  it('creates edges from declared dependencies', async () => {
    const domains = [
      make_domain('auth', 'Authentication', 1, []),
      make_domain('tasks', 'Task Management', 2, ['auth']),
      make_domain('config', 'Configuration', 5, [])
    ]

    // No consolidated notes needed for declared deps
    const graph = await build_interaction_graph(domains, output_dir)

    expect(graph.nodes.size).toBe(3)

    // tasks -> auth declared dependency
    const declared = graph.edges.filter(e => e.source === 'declared')

    expect(declared.length).toBe(1)
    expect(declared[0].from).toBe('tasks')
    expect(declared[0].to).toBe('auth')
  })

  it('creates edges from observed references in notes', async () => {
    const domains = [
      make_domain('auth', 'Authentication', 1, []),
      make_domain('tasks', 'Task Management', 2, [])
    ]

    // Auth notes mention "tasks"
    await write_consolidated_notes(output_dir, 'auth', CONSOLIDATED_AUTH)
    await write_consolidated_notes(output_dir, 'tasks', CONSOLIDATED_TASKS)

    const graph = await build_interaction_graph(domains, output_dir)

    const observed = graph.edges.filter(e => e.source === 'observed')

    // Auth notes mention "tasks" and tasks notes mention "auth"
    expect(observed.length).toBeGreaterThan(0)
  })
})

describe('identify_clusters', () => {
  it('groups connected domains into clusters', () => {
    const graph = {
      nodes: new Set(['a', 'b', 'c', 'd']),
      edges: [
        { from: 'a', to: 'b', source: 'declared' as const, weight: 2 },
        { from: 'c', to: 'd', source: 'declared' as const, weight: 2 }
      ],
      adjacency: new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['a'])],
        ['c', new Set(['d'])],
        ['d', new Set(['c'])]
      ])
    }

    const clusters = identify_clusters(graph)

    expect(clusters.length).toBe(2)
    expect(clusters.some(c => c.includes('a') && c.includes('b'))).toBe(true)
    expect(clusters.some(c => c.includes('c') && c.includes('d'))).toBe(true)
  })

  it('excludes isolated domains with no edges', () => {
    const graph = {
      nodes: new Set(['a', 'b', 'isolated']),
      edges: [
        { from: 'a', to: 'b', source: 'declared' as const, weight: 2 }
      ],
      adjacency: new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['a'])],
        ['isolated', new Set<string>()]
      ])
    }

    const clusters = identify_clusters(graph)

    expect(clusters.length).toBe(1)
    expect(clusters[0]).toContain('a')
    expect(clusters[0]).toContain('b')

    const all_nodes = clusters.flat()

    expect(all_nodes).not.toContain('isolated')
  })

  it('splits components exceeding 5 domains by removing weakest edges', () => {
    // Create a chain of 7 nodes: a-b-c-d-e-f-g with weak middle edges
    const nodes = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const edges = [
      { from: 'a', to: 'b', source: 'declared' as const, weight: 2 },
      { from: 'b', to: 'c', source: 'declared' as const, weight: 2 },
      { from: 'c', to: 'd', source: 'observed' as const, weight: 1 },
      { from: 'd', to: 'e', source: 'declared' as const, weight: 2 },
      { from: 'e', to: 'f', source: 'declared' as const, weight: 2 },
      { from: 'f', to: 'g', source: 'declared' as const, weight: 2 }
    ]

    const adjacency = new Map<string, Set<string>>()

    for (const n of nodes) {
      adjacency.set(n, new Set())
    }

    for (const e of edges) {
      adjacency.get(e.from)!.add(e.to)
      adjacency.get(e.to)!.add(e.from)
    }

    const graph = {
      nodes: new Set(nodes),
      edges,
      adjacency
    }

    const clusters = identify_clusters(graph)

    // All clusters should be <= 5
    for (const cluster of clusters) {
      expect(cluster.length).toBeLessThanOrEqual(5)
    }

    // All nodes should be represented
    const all_nodes = clusters.flat().sort()

    expect(all_nodes).toEqual(nodes.sort())
  })
})
