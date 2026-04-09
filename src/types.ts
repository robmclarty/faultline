/////////////////////////////////////////////////////////////////// Constants //

export const PHASE_NAMES = ['survey', 'extract', 'reconcile', 'synthesize'] as const

export const DEFAULT_EXCLUDES = [
  'node_modules/**',
  'vendor/**',
  'dist/**',
  'build/**',
  '.git/**',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '*.png', '*.jpg', '*.jpeg', '*.gif', '*.svg', '*.ico', '*.webp',
  '*.mp3', '*.mp4', '*.wav', '*.avi', '*.mov',
  '*.woff', '*.woff2', '*.ttf', '*.eot',
  '*.exe', '*.dll', '*.so', '*.dylib',
  '*.zip', '*.tar', '*.gz', '*.rar',
  '*.pdf', '*.doc', '*.docx',
  '*.min.js', '*.min.css',
  '*.map'
] as const

export const DEFAULT_CONTEXT_BUDGET = 150_000

export const MAX_CLAUDE_FILE_TOKENS = 5_000

export const MAX_CLAUDE_FILE_CHARS = 20_000

/////////////////////////////////////////////////////////////////////// Types //

export type PhaseName = typeof PHASE_NAMES[number]

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export type FileCategory =
  | 'source'
  | 'test'
  | 'config'
  | 'documentation'
  | 'data'
  | 'style'
  | 'asset'
  | 'build'
  | 'other'

export type FileEntry = {
  path: string
  size_bytes: number
  tokens_est: number
  extension: string
  language: string
  category: FileCategory
}

export type FileIndex = FileEntry[]

export type DomainSubDomain = {
  id: string
  label: string
  description: string
  directories: string[]
  key_files: string[]
  estimated_tokens: number
}

export type Domain = {
  id: string
  label: string
  description: string
  directories: string[]
  key_files: string[]
  estimated_tokens: number
  priority: number
  depends_on: string[]
  sub_domains: DomainSubDomain[]
}

export type DomainReview = {
  passed: boolean
  issues: string[]
  suggestions: string[]
}

export type ExtractionTask = {
  domain_id: string
  batch_index: number
  files: string[]
  estimated_tokens: number
  layer?: string
}

export type ExtractionPlan = {
  context_budget: number
  total_batches: number
  tasks: ExtractionTask[]
}

export type ManifestDependency = {
  name: string
  version: string
  dev: boolean
}

export type Manifest = {
  name: string
  version: string
  type: string
  dependencies: ManifestDependency[]
}

export type TaskState = {
  id: string
  name: string
  status: TaskStatus
  started_at?: string
  completed_at?: string
  error?: string
}

export type PhaseState = {
  phase: PhaseName
  status: TaskStatus
  started_at?: string
  completed_at?: string
  tasks: TaskState[]
}

export type PipelineState = {
  target_dir: string
  created_at: string
  updated_at: string
  phases: PhaseState[]
}

export type BudgetEntry = {
  timestamp: string
  phase: string
  task: string
  model: string
  input_tokens: number
  output_tokens: number
  estimated_cost: number
}

export type BudgetLog = {
  entries: BudgetEntry[]
  total_cost: number
}

export type LearningType = 'observation' | 'hypothesis' | 'contradiction' | 'pattern'

export type LearningEntry = {
  id: string
  type: LearningType
  domain: string
  content: string
  source_phase: PhaseName
  created_at: string
  tokens_est: number
}

export type LearningsActive = {
  entries: LearningEntry[]
  total_tokens: number
}

export type LearningsLog = {
  entries: LearningEntry[]
}

export type ClaudeInvocationResult = {
  stdout: string
  stderr: string
  exit_code: number
  model: string
  input_tokens: number
  output_tokens: number
}

export type ExtractionReview = {
  passed: boolean
  issues: string[]
  suggestions: string[]
  uncovered_files: string[]
}

export type CrossReferenceFindingType =
  | 'duplicate_rule'
  | 'missing_handoff'
  | 'shared_invariant'
  | 'undeclared_dependency'

export type CrossReferenceFinding = {
  type: CrossReferenceFindingType
  description: string
  affected_domains: string[]
  resolution_hint: string
}

export type CrossReferenceCluster = {
  domains: string[]
  findings: CrossReferenceFinding[]
}

export type CrossReferenceReport = {
  clusters: CrossReferenceCluster[]
  total_findings: number
  generated_at: string
}

export type DomainSummary = {
  domain_id: string
  label: string
  summary: string
  tokens_est: number
}

export type FaultlineConfig = {
  target_dir: string
  model: string
  survey_model: string
  review_model: string
  context_budget: number
  timeout: number
  max_retries: number
  concurrency: number
  skip_deep_pass: boolean
  skip_reconcile: boolean
  ridgeline_name: string
  include: string[]
  exclude: string[]
  output_dir: string
  verbose: boolean
}
