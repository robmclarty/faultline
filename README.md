# faultline

Reverse-engineer (or "decompile") brownfield codebases into abstract product
specs. Faultline analyzes existing code and produces implementation-agnostic
specifications that capture what a system does, not how it's built.

## Installation

```bash
npm install
npm run build
```

## Quick Start

```bash
# Run the full pipeline end-to-end
npx faultline analyze ./path/to/project

# Preview what would happen without running Claude
npx faultline dry-run ./path/to/project

# Check pipeline status
npx faultline status ./path/to/project
```

## Commands

### `analyze` — Full pipeline

Runs all four phases in sequence: survey, extract, reconcile, synthesize.
Resumes from the last completed task if interrupted.

```bash
npx faultline analyze ./project
npx faultline analyze ./project --skip-reconcile
npx faultline analyze ./project --skip-deep-pass
npx faultline analyze ./project --max-budget-usd 5.00
npx faultline analyze ./project --ridgeline my-build
npx faultline analyze ./project --concurrency 5 --timeout 600000
```

### `survey` — Phase 1

Index files, classify by type, map to domains, plan extraction.

```bash
npx faultline survey ./project
npx faultline survey ./project --include "*.ts" "*.tsx"
npx faultline survey ./project --exclude "generated/**"
```

### `extract` — Phase 2

Read source code in batches, extract product knowledge per domain.

```bash
npx faultline extract ./project
npx faultline extract ./project --concurrency 5
npx faultline extract ./project --skip-deep-pass
```

### `reconcile` — Phase 2.5

Cross-reference domains for duplications, contradictions, and shared invariants.

```bash
npx faultline reconcile ./project
```

### `synthesize` — Phase 3

Generate abstract product specifications from extracted knowledge.

```bash
npx faultline synthesize ./project
npx faultline synthesize ./project --ridgeline my-build
npx faultline synthesize ./project --skip-reconcile
```

### `dry-run` — Cost preview

Shows the extraction plan with per-domain task counts, batch counts, token
usage, estimated Claude invocations, and projected cost. Runs survey first
if needed.

```bash
npx faultline dry-run ./project
```

### `status` — Pipeline progress

Displays completed, in-progress, and pending phases/tasks with timing and cost.

```bash
npx faultline status ./project
```

## Key Flags

| Flag | Description | Default |
|------|-------------|---------|
| `-m, --model` | Claude model to use | `sonnet` |
| `--survey-model` | Model for survey phase | `sonnet` |
| `--concurrency` | Max parallel domain extractions | `3` |
| `--max-retries` | Max retries per Claude invocation | `3` |
| `--max-budget-usd` | Cost ceiling in USD (0 = unlimited) | `0` |
| `--skip-reconcile` | Skip cross-domain reconciliation | `false` |
| `--skip-deep-pass` | Skip deep extraction for high-priority domains | `false` |
| `--ridgeline <name>` | Copy output to `.ridgeline/builds/<name>/` | - |
| `--include <patterns>` | Glob patterns to include | all files |
| `--exclude <patterns>` | Additional glob patterns to exclude | - |
| `--context-budget` | Token budget per batch | `150000` |
| `--timeout` | Timeout per Claude invocation (ms) | `300000` |
| `-v, --verbose` | Show debug output and Claude stderr | `false` |

## Pipeline

```text
survey ──→ extract ──→ reconcile ──→ synthesize
  │            │           │             │
  ├─ file_index│           │             ├─ specs/
  ├─ domains   ├─ batch    ├─ cross_refs ├─ architecture.md
  ├─ plan      │  notes    │             ├─ constraints.md
  ├─ arch.md   ├─ consol.  │             └─ taste.md
  └─ learnings │  notes    │
               └─ reviews  └─ learnings
```

Each phase reads from prior artifacts in `.faultline/` and writes its own.
State is persisted after every task completion for resume support.

## Resume & Interruption

Faultline is designed for long-running analysis. If a run is interrupted
(Ctrl+C, crash, timeout), re-running the same command resumes from the last
completed task:

- SIGINT kills all active Claude subprocesses and saves state before exit
- Re-running skips completed phases and completed tasks within phases
- Budget ceiling enforcement halts gracefully, saving state for later resumption

## Cost Expectations

Cost depends on codebase size and model choice. Rough estimates for sonnet:

| Codebase Size | Estimated Cost |
|---------------|---------------|
| Small (<50 files) | $0.10 - $0.50 |
| Medium (50-200 files) | $0.50 - $2.00 |
| Large (200-1000 files) | $2.00 - $10.00 |

Use `npx faultline dry-run` to get a cost estimate before running the full
pipeline. Use `--max-budget-usd` to set a cost ceiling.

## Output

Final deliverables are written to `.faultline/output/`:

```text
.faultline/output/
├── specs/
│   ├── 00-overview.md          # System overview with shared invariants
│   ├── auth/01-auth.md         # Per-domain specs
│   └── tasks/01-tasks.md
├── architecture.md             # Refined architecture description
├── constraints.md              # Build/runtime constraints
└── taste.md                    # Coding style and conventions
```

With `--ridgeline <name>`, output is also copied to
`.ridgeline/builds/<name>/` for use with [ridgeline](https://github.com/robmclarty/ridgeline).

## Architecture

```text
src/
├── cli.ts              # Entry point (commander setup)
├── commands/           # CLI command handlers (thin shells)
├── engine/             # Orchestration and analysis logic
│   ├── claude/         # Claude CLI subprocess integration
│   ├── pipeline/       # Phase execution sequencing
│   ├── file_walker.ts  # Directory traversal with glob filtering
│   ├── token_estimator.ts  # File size → token estimation
│   └── batcher.ts      # Token-budgeted batch packing
├── stores/             # Disk persistence (.faultline/ artifacts)
├── ui/                 # Terminal output (spinners, logs, reporters)
├── agents/             # Prompt templates (markdown, loaded at runtime)
└── types.ts            # Shared type definitions
```

See [docs/architecture.md](docs/architecture.md) for detailed diagrams and
module descriptions.

## Development

```bash
npm run dev       # Watch mode
npm test          # Typecheck + lint + unit tests
npm run coverage  # Test coverage report
```
