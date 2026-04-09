# Architecture

## Overview

Faultline is a CLI tool that orchestrates Claude to reverse-engineer codebases
into abstract product specifications. The architecture is designed around a key
principle: **the harness is deterministic, all non-determinism lives in Claude
invocations**.

## Layers

```text
┌─────────────┐
│  commands/   │  CLI argument parsing, delegates to engine
├─────────────┤
│  engine/     │  Orchestration, analysis, Claude integration
│  ├ pipeline/ │  Phase sequencing (survey, extract, synthesize)
│  ├ claude/   │  Subprocess management, prompt loading, response parsing
│  └ (core)    │  File walking, token estimation, batch packing
├─────────────┤
│  stores/     │  Disk persistence (.faultline/ artifacts)
├─────────────┤
│  ui/         │  Terminal output (spinners, logs, reporters)
├─────────────┤
│  agents/     │  Prompt templates (markdown files)
└─────────────┘
```

### commands/

Thin shells. Parse CLI args via commander, call into `engine/pipeline/`, and
report results via `ui/`. No direct file I/O or Claude interaction. Each file
maps to one CLI subcommand.

### engine/

All orchestration and analysis logic. Decides what to do and in what order.

- **pipeline/** — Phase sequencing. `survey.exec.ts`, `extract.exec.ts`,
  `reconcile.exec.ts`, and `synthesize.exec.ts` run each phase's steps in
  order, managing state transitions and error recovery.
- **claude/** — Subprocess management for `claude --print`. Handles timeout
  enforcement (kills the child process), retry with exponential backoff, cost
  capture, and a process registry for graceful SIGINT cleanup.
- **file_walker.ts** — Recursive directory traversal with glob-based
  include/exclude filtering.
- **token_estimator.ts** — Estimates token counts from file sizes. Code files
  use `ceil(bytes/4)`, prose files use `ceil(bytes/5)`.
- **batcher.ts** — Greedy bin-packing of items into token-budgeted batches.
  Oversized domains are split by layer (models → routes → services → tests).

### stores/

Owns every file under `.faultline/`. Each module manages a specific artifact
group. Pure data I/O: read JSON, write JSON, validate size constraints. No
orchestration logic.

- **state.ts** — Pipeline state persistence and resume detection
- **budget.ts** — Per-invocation cost logging
- **survey.ts** — Survey phase artifacts (file_index, domains, etc.)
- **extractions.ts** — Extraction artifacts (batch notes, consolidated notes, reviews)
- **reconciliation.ts** — Cross-reference report read/write
- **synthesis.ts** — Domain summaries read/write
- **output.ts** — Final deliverable output with ridgeline copy support
- **learnings.ts** — Two-tier learnings system
- **validation.ts** — Token ceiling enforcement

### ui/

Terminal output only. Spinners, progress indicators, formatted tables, log
levels. Imported by `commands/` and `engine/pipeline/`, never by `stores/`.

### agents/

Markdown prompt templates loaded at runtime. Simple `{{variable}}` interpolation
is handled by the harness. These files are not Claude Code agents — they are
system prompts passed to `claude --print`.

## Key Design Decisions

### Why shell out to `claude --print`?

The harness stays thin. Claude handles all analysis. The subprocess boundary
provides natural isolation, timeout enforcement, and cost tracking without
managing API connections directly.

### Why a two-tier learnings system?

The **full log** is append-only and preserves everything for debugging. The
**active set** is bounded to 3k tokens and compressed by dropping low-priority
entries (hypotheses first, contradictions last). This keeps cross-phase context
focused without losing history.

### Why greedy bin-packing?

Files are packed into batches greedily because the ordering matters — files in
the same directory should end up in the same batch when possible. A greedy
approach preserves locality while respecting token budgets.

### Why no API SDK?

The constraints require using `claude --print` for all model invocations. This
keeps the harness dependency-free (only commander for CLI parsing) and makes
it easier to swap models or use different Claude configurations.

## Data Flow

```text
Survey:
  codebase → [file walker] → file_index.json
           → [classifier]  → file_index.json (updated)
           → [domain mapper] → domains.json
           → [domain review] → domain_review.json
           → [plan builder]  → extraction_plan.json
           → [architecture]  → architecture.md
                             → learnings.json

Extract:
  file_index + domains + plan → [batch extractor] → batch-NN.notes.md
                               → [consolidator]   → consolidated.notes.md
                               → [reviewer]       → review.json
                               → [deep pass]      → deep_pass.notes.md
                                                   → learnings.json

Reconcile:
  domains + consolidated notes → [graph builder] → interaction graph
                                → [clusterer]    → clusters
                                → [reconciler]   → cross_references.json
                                                 → learnings.json

Synthesize:
  consolidated notes + cross_refs → [summarizer]  → domain_summaries.json
                                  → [spec writer] → specs/<domain>/*.md
                                  → [enforcer]    → abstraction scan + rewrite
                                  → [overview]    → specs/00-overview.md
                                  → [arch refine] → architecture.md
                                  → [constraints] → constraints.md
                                  → [taste]       → taste.md
```

Each step reads from prior artifacts and writes new ones. The state.json file
tracks completion so the pipeline can resume after interruption.
