# Module Reference

## engine/token_estimator.ts

Converts file sizes to estimated token counts. Uses two divisors:

- **Code files**: `ceil(bytes / 4)` — code has more tokens per byte due to
  short identifiers and operators
- **Prose files**: `ceil(bytes / 5)` — natural language has longer words

Prose detection is based on file extension (.md, .txt, .html, .xml, etc.).

## engine/file_walker.ts

Recursively traverses a directory tree. Features:

- **Default excludes**: node_modules, vendor, dist, build, .git, lock files,
  binary/media formats
- **Custom include/exclude**: Glob patterns via `--include` and `--exclude` flags
- **Glob matching**: Supports `dir/**`, `*.ext`, and exact filename patterns
- **Category detection**: Classifies files as source, test, config, docs, style,
  build, or other based on path patterns and extensions
- **Tree generation**: Produces a text-based directory tree from file entries

## engine/batcher.ts

Packs items into token-budgeted batches:

- **Greedy packing**: Items are added to the current batch until the budget is
  exceeded, then a new batch starts
- **Oversized items**: Items larger than the budget get their own batch
- **Layer splitting**: Domains over 80k tokens are split by layer (models/types
  first, routes/controllers second, services third, tests fourth)

## engine/claude/invoke.ts

Manages Claude subprocess lifecycle:

- Writes system prompt to a temp file
- Spawns `claude --print --model <model> --system-prompt <file> --verbose`
- Pipes input via stdin, captures stdout/stderr
- **Timeout**: Kills the child process after the configured timeout
- **Retry**: Exponential backoff on non-zero exit codes (up to max_retries)
- **Cost tracking**: Parses token counts from stderr, logs to budget.json
- **Process registry**: Tracks active processes for graceful SIGINT cleanup

## engine/claude/prompt_loader.ts

Loads markdown templates from `src/agents/` and interpolates `{{variable}}`
placeholders. Variables not found in the provided map are left as-is.

## engine/claude/response_parser.ts

Extracts structured data from Claude's mixed text/code output:

- **JSON extraction**: Tries fenced `\`\`\`json` blocks, then unfenced code
  blocks, then raw JSON detection
- **Markdown section extraction**: Finds sections by heading name, respects
  heading depth
- **Markdown body extraction**: Strips wrapping code fences

## stores/state.ts

Pipeline state persistence. The state file tracks:

- Which phases have run and their status
- Per-step status within each phase
- Timestamps for start and completion
- Error messages for failed tasks

This enables resume: if the pipeline crashes mid-survey, rerunning picks up
from the last completed step.

## stores/learnings.ts

Two-tier knowledge system:

- **Full log** (`learnings.log.json`): Append-only, preserves all entries
- **Active set** (`learnings.json`): Bounded to 3k tokens

When the active set exceeds its budget, entries are compressed by dropping
the lowest-priority types first:

1. `hypothesis` (dropped first — least certain)
2. `observation` (factual but potentially redundant)
3. `pattern` (structural insights)
4. `contradiction` (dropped last — important corrections)

Within the same type, older entries are dropped before newer ones.

## stores/extractions.ts

Manages extraction artifacts under `.faultline/extractions/<domain>/`:

- **Batch notes**: `batch-NN.notes.md` — individual batch extraction results
- **Consolidated notes**: `consolidated.notes.md` — merged per-domain notes
- **Reviews**: `review.json` — extraction reviewer verdicts
- **Deep pass**: `deep_pass.notes.md` — additional findings for high-priority domains

All markdown files are validated against the 5k token ceiling before writing.

## stores/reconciliation.ts

Manages the cross-reference report at
`.faultline/extractions/cross_references.json`. The report contains clusters
of related domains and typed findings (duplicate_rule, missing_handoff,
shared_invariant, undeclared_dependency).

## stores/synthesis.ts

Manages domain summaries at `.faultline/synthesis/domain_summaries.json`.
Each summary is approximately 500 tokens of compressed domain knowledge
used as context during spec writing.

## stores/output.ts

Manages final deliverables under `.faultline/output/`. Supports nested
subdirectories for spec organization (e.g., `specs/auth/01-identity.md`).

Also handles copying the entire output to `.ridgeline/builds/<name>/` when
the `--ridgeline` flag is specified.

## stores/validation.ts

Enforces the 5k token ceiling (~20k characters) on any file intended for
Claude consumption. This prevents accidentally sending oversized context
that would degrade model performance.

## engine/pipeline/reconcile.exec.ts

Cross-domain reconciliation pipeline:

1. **Graph building**: Constructs a domain interaction graph from declared
   dependencies (domains.json `depends_on`) plus grep-based reference
   detection in consolidated notes
2. **Cluster identification**: Finds connected components via BFS, splits
   components exceeding 5 domains by removing weakest edges
3. **Per-cluster reconciliation**: Sends all constituent domains' consolidated
   notes to Claude to find duplications, contradictions, missing handoffs,
   shared invariants, and undeclared dependencies
4. **Learnings**: Appends findings to the learnings system

Isolated domains (no cross-domain edges) are skipped.

## engine/pipeline/synthesize.exec.ts

Synthesis pipeline with seven steps:

1. **3a: Domain summaries** — Compress each domain's consolidated notes to
   ~500 tokens for use as context
2. **3b: Spec writing** — Per-domain spec writing in ridgeline format
   (Overview, Requirements, Known Gaps, Relationships), with Claude deciding
   single vs multi-file output via `SPEC_SPLIT` delimiters
3. **3b': Abstraction enforcement** — Harness-level scan for file extensions,
   framework names, long identifiers, and path-like strings. Flagged specs
   are resubmitted once with violation feedback
4. **3c: Overview** — System-wide overview with shared invariants from
   reconciliation
5. **3d: Architecture** — Refinement of survey architecture with extraction
   and reconciliation insights
6. **3e: Constraints** — Extraction from manifests and config files
7. **3f: Taste** — Extraction from linter configs and source samples
