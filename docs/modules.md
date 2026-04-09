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

## stores/validation.ts

Enforces the 5k token ceiling (~20k characters) on any file intended for
Claude consumption. This prevents accidentally sending oversized context
that would degrade model performance.
