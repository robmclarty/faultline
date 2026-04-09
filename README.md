# faultline

Reverse-engineer (or "decompile") brownfield codebases into abstract product
specs. Faultline analyzes existing code and produces implementation-agnostic
specifications that capture what a system does, not how it's built.

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
# Survey a codebase (first step)
npx faultline survey ./path/to/project

# Check pipeline status
npx faultline status ./path/to/project

# See all commands
npx faultline --help
```

## Pipeline

Faultline runs a multi-phase pipeline:

1. **Survey** — Index files, classify by type, map to domains, plan extraction
2. **Extract** — Read source code in batches, extract product knowledge
3. **Reconcile** — Cross-reference and validate extracted knowledge
4. **Synthesize** — Generate abstract product specifications

Each phase produces artifacts in `.faultline/` that feed the next phase.

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

See [docs/architecture.md](docs/architecture.md) for details.

## How It Works

Faultline uses Claude as its analysis engine. The harness is deterministic —
all non-determinism lives inside the Claude invocations. The harness manages:

- File traversal and token estimation
- Batch packing within context budgets
- Prompt template loading with `{{variable}}` interpolation
- Claude subprocess lifecycle (timeout, retry, cost tracking)
- State persistence for resumable pipelines
- A two-tier learnings system for cross-phase knowledge transfer

## Development

```bash
npm run dev       # Watch mode
npm test          # Typecheck + lint + unit tests
npm run coverage  # Test coverage report
```
