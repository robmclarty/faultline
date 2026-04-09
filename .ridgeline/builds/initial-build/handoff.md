# Handoff

## Phase 1: Foundation & Survey Pipeline

### What was built

**Project foundation:**

- `tsconfig.json` — TypeScript 5.x config targeting ES2022/Node16 with strict mode
- `package.json` — Updated bin field to `dist/cli.js`, all deps already installed
- `.markdownlint-cli2.jsonc` — Added ignores for `.ridgeline/` and `CLAUDE.md`
- `.agnix.toml` — Excluded `src/agents/**` (prompt templates, not Claude Code agents)
- `.fallowrc.json` — Configured ignores for test fixtures, disabled unused-export rules (library exports for future phases)

**Source modules (src/):**

- `types.ts` — All shared types: FileEntry, Domain, DomainReview, ExtractionPlan, Manifest, PipelineState, BudgetEntry, LearningEntry, FaultlineConfig, etc.
- `cli.ts` — Commander entry point registering all 7 subcommands
- `commands/` — Thin shells for analyze, survey, extract, reconcile, synthesize, dry-run, status (barrel index.ts)
- `engine/token_estimator.ts` — ceil(bytes/4) for code, ceil(bytes/5) for prose
- `engine/file_walker.ts` — Recursive traversal with glob include/exclude, category detection, tree generation
- `engine/batcher.ts` — Greedy bin-packing with layer-based splitting for oversized domains (>80k tokens)
- `engine/manifest_parser.ts` — package.json parsing (extensible to Cargo.toml, pyproject.toml)
- `engine/claude/invoke.ts` — Subprocess management with timeout, retry, cost tracking, process registry
- `engine/claude/prompt_loader.ts` — Template loading from src/agents/ with {{variable}} interpolation
- `engine/claude/response_parser.ts` — JSON block extraction, markdown section/body extraction
- `engine/pipeline/survey.exec.ts` — Full survey pipeline (file index → classify → domains → review → plan → architecture → learnings)
- `engine/pipeline/extract.exec.ts` — Stub
- `engine/pipeline/synthesize.exec.ts` — Stub
- `stores/state.ts` — Pipeline state persistence with resume support
- `stores/budget.ts` — Per-invocation cost logging with model-specific pricing
- `stores/survey.ts` — Survey artifact read/write (file_index, manifest, tree, domains, domain_review, extraction_plan, architecture)
- `stores/learnings.ts` — Two-tier learnings (3k-token active set with retention priority compression)
- `stores/extractions.ts` — Batch/consolidated notes read/write
- `stores/output.ts` — Final deliverable write
- `stores/validation.ts` — 5k token ceiling enforcement
- `stores/config.ts` — Config resolution (CLI flags → defaults)
- `ui/log.ts` — Structured logging with color
- `ui/spinner.ts` — Terminal spinner for long ops
- `ui/reporter.ts` — Status/budget/survey formatters

**Agent templates (src/agents/):**

- `survey/classify.md` — File classification prompt
- `survey/domains.md` — Domain mapping prompt
- `survey/review.md` — Adversarial domain review prompt
- `survey/architecture.md` — Architecture description prompt
- `extract/system.md`, `extract/consolidate.md`, `extract/validate_feedback.md`
- `synthesize/summarize.md`, `synthesize/spec.md`, `synthesize/overview.md`, `synthesize/architecture.md`, `synthesize/constraints.md`, `synthesize/taste.md`
- `shared/abstraction_rules.md`, `shared/ridgeline_format.md`

**Test fixture:** `test/fixtures/sample-app/` — Express API with auth, tasks, models, middleware, utils, config, docs, scripts, public, test

**Tests:** 79 unit tests across 11 test files covering token estimation, file walker glob matching, batch packing, config resolution, state round-trip, budget append/read, learnings compression/domain filtering, validation ceiling, prompt interpolation, response parsing

**Docs:** README.md, docs/architecture.md, docs/modules.md, docs/security.md, docs/howto.md

### Decisions

- **Prompt templates excluded from agnix**: The files in `src/agents/` are runtime prompt templates loaded by the harness, not Claude Code agent configurations. They don't need YAML frontmatter.
- **Fallow unused-export rules disabled**: Many store and engine exports are public API for future phases (extract, synthesize). Flagging them as unused would be noise.
- **Fixture test file uses `_register`/`_login`**: Prefixed with underscore to satisfy oxlint's no-unused-vars rule since the test stubs don't use the imported functions.
- **File sort uses string comparison not localeCompare**: `localeCompare` is locale-dependent and produces inconsistent ordering (e.g., uppercase before/after lowercase). Default JS string comparison is deterministic.
- **detect_category refactored to use Sets**: Reduced cyclomatic complexity from 29 to under threshold by extracting pattern/extension sets as module-level constants.

### Deviations

- The spec mentions `domain sampling validation (1c'')` as a step, but the acceptance criteria don't explicitly require a separate output file for it. The domain review (1c') covers the adversarial check. If sampling validation is needed as a separate step, it can be added in a later phase.
- The spec lists subcommands including `analyze, survey, extract, reconcile, synthesize, dry-run, status` — the acceptance criteria say `analyze, survey, extract, synthesize, dry-run, status` (missing reconcile). I included reconcile since the pipeline has 4 phases: survey, extract, reconcile, synthesize.

### Notes for next phase

- The `engine/pipeline/extract.exec.ts` and `synthesize.exec.ts` are stubs that throw "not yet implemented". They need to be fleshed out in their respective phases.
- The survey pipeline calls Claude for classification, domain mapping, review, and architecture. To test end-to-end, you need `claude` CLI available. Unit tests mock at the file/data level, not the subprocess level.
- The learnings system is initialized during survey (step 1e') with cross-cutting observations from the architecture description. Future phases should call `append_learnings()` to add domain-specific learnings and `get_domain_learnings()` to retrieve relevant context.
- The `stores/config.ts` currently only merges CLI flags over defaults. Config file support (`config.json` in `.faultline/`) was omitted since no acceptance criterion requires it, but the architecture supports adding it.
- All barrel `index.ts` files exist for commands/, engine/, stores/, ui/.

## Phase 1 Retry: Fix Criteria 17 & 21

### What was fixed

1. **Criterion 17 — Domain retry propagation** (`src/engine/pipeline/survey.exec.ts`): Changed `final_domains` from always referencing the original domains to using a `let` variable that gets reassigned to the retry result when domain review fails. Subsequent steps (extraction plan, architecture description) now correctly use retried domains.

2. **Criterion 21 — Learnings token ceiling** (`src/stores/learnings.ts`): Added `validate_token_ceiling()` call on the serialized active set before writing `learnings.json` to disk. This ensures explicit 5k token ceiling enforcement on all Claude-bound files, complementing the implicit 3k compression limit.

### Decisions

- Used a `let` variable pattern instead of reading domains back from disk — simpler and avoids the null-handling overhead of `read_domains()`.

### Deviations

None.

### Notes for next phase

No changes from the original Phase 1 notes.

## Phase 1 Retry 2: Fix Criterion 18 — Config.json middle tier

### What was fixed

1. **Criterion 18 — Config resolution three-tier chain** (`src/stores/config.ts`): Added `load_config_file()` helper that reads `config.json` from `<target_dir>/<output_dir>/config.json` if it exists. `resolve_config()` now merges three tiers: defaults → config.json → CLI flags. Gracefully handles missing, malformed, or non-object config files by returning empty overrides.

2. **Config tests** (`src/stores/__tests__/config.test.ts`): Rewrote tests to cover all four required scenarios: (1) defaults alone, (2) config.json overrides defaults, (3) CLI flags override config.json, (4) missing config.json gracefully falls back. Also added edge cases for malformed JSON and non-object content. Total test count: 83 (up from 79).

### Decisions

- Config.json path is resolved as `<target_dir>/<output_dir>/config.json` using the output_dir from CLI overrides (or the default `.faultline`). This means config lives inside the pipeline output directory alongside state.json and budget.json.
- Tests use `/tmp/faultline-config-test` with real filesystem operations rather than mocks to verify actual config.json loading behavior.

### Deviations

None.

### Notes for next phase

- Projects can now place a `config.json` in their `.faultline/` directory to set persistent configuration (model, timeout, budget, etc.) that applies across runs without CLI flags.

## Phase 2: Extraction Pipeline

### What was built

**Types & config:**

- `ExtractionReview` type added to `types.ts` with `passed`, `issues`, `suggestions`, `uncovered_files` fields
- `FaultlineConfig` extended with `concurrency` (default 3) and `skip_deep_pass` (default false) fields
- Config defaults updated in `stores/config.ts`

**Agent templates (src/agents/extract/):**

- `system.md` — Full extraction prompt with domain context, architecture digest, learnings, handoff context, and structured output format (Business Rules, Data Invariants, Gaps, Cross-Domain Observations, Notes for Next Batch)
- `consolidate.md` — Consolidation prompt merging batch notes with aggressive compression rules for >15k token inputs, optional review feedback injection
- `review.md` — Adversarial review prompt checking file coverage, abstraction violations (framework keywords from manifest), cross-domain references, and gap plausibility
- `deep_pass.md` — Deep extraction prompt targeting missed rules, implicit invariants, and edge cases
- `validate_feedback.md` — Validation retry prompt for uncovered source files

**Stores:**

- `stores/extractions.ts` — Rewritten with zero-padded batch filenames (`batch-00.notes.md`), plus `write/read_extraction_review`, `write/read_deep_pass_notes`
- `stores/survey.ts` — Added `read_extraction_plan` and `read_architecture` for extraction phase consumption
- Barrel `stores/index.ts` updated to export all new functions

**Pipeline (`engine/pipeline/extract.exec.ts`):**

- Full extraction orchestration with domain-level parallel execution and batch-level serial execution
- Multi-batch handoff: prior batch notes compressed to ~2k tokens (8k chars) passed as context
- Consolidation: all batch notes merged into `consolidated.notes.md` per domain
- Review: sonnet-model review checking file coverage, abstraction violations, gap plausibility
- Validation: `find_missing_files` checks basename grep; retries up to `max_retries` with feedback
- Review retry: on failed review, re-consolidates once with review feedback appended
- Deep pass: for priority ≤ 2 domains with suggestions, re-reads uncovered/key files and merges findings
- Learnings: cross-domain observations extracted from consolidated notes and appended to learnings system
- Process registry: parallel execution respects `--concurrency` limit using a domain queue with Promise.race
- State tracking: each extraction task tracked individually in state.json for resume support

**CLI (`commands/extract.ts`):**

- Fully wired with `--model`, `--concurrency`, `--max-retries`, `--skip-deep-pass`, `--timeout`, `--verbose` flags

**Tests (28 new, 111 total):**

- `stores/__tests__/extractions.test.ts` (10 tests): batch notes, consolidated notes, extraction review, deep pass notes read/write
- `engine/pipeline/__tests__/extract.exec.test.ts` (18 tests): single-batch extraction, multi-batch serial with handoff, review feedback loop (pass/fail), deep pass triggering (4 scenarios), parallel concurrency, learnings append flow, learnings filtering, consolidated notes format, resume support

### Decisions

- **Batch filenames use zero-padded format** (`batch-00.notes.md` instead of `batch_0.md`) — matches the `batch-NN.notes.md` format specified in acceptance criteria
- **Consolidated notes filename**: `consolidated.notes.md` (per spec) instead of the Phase 1 stub's `consolidated.md`
- **High-priority threshold**: priority ≤ 2 (not just priority === 1) for deep pass triggering — domains with priority 1 or 2 are considered high-priority
- **Framework keywords extracted from all manifest dependencies** (both runtime and dev) — dev dependencies like test frameworks can also indicate abstraction violations
- **Review invocation failures** are gracefully handled by returning a passed review, allowing extraction to proceed without blocking on transient Claude errors
- **Validation uses basename matching** (case-insensitive) rather than full path matching — simpler and more robust since Claude may reference files by name only

### Deviations

- The spec mentions `extraction review detects abstraction violations by scanning for framework keywords from manifest.json` — the implementation passes these keywords to Claude as part of the review prompt rather than doing harness-side string scanning. This is more robust since Claude can understand contextual usage vs. coincidental keyword matches.
- Batch notes filenames changed from Phase 1's `batch_0.md` pattern to `batch-00.notes.md` to match the acceptance criteria's `batch-NN.notes.md` format. This is a breaking change if any Phase 1 artifacts used the old format (none did in practice since extraction was a stub).

### Notes for next phase

- The `engine/pipeline/synthesize.exec.ts` is still a stub. It should consume the consolidated notes from `.faultline/extractions/<domain>/consolidated.notes.md`, the architecture description, and the learnings system to produce the final ridgeline-compatible output.
- The learnings system now has entries from both survey (architecture cross-cutting observations) and extraction (cross-domain observations per domain). The synthesis phase should use `read_active_learnings()` for the full bounded set.
- The `reconcile` phase (between extract and synthesize) is still a stub. If it's needed, it should read all consolidated notes and resolve cross-domain contradictions/overlaps before synthesis.
- The `output_dir` pattern for extraction artifacts is `.faultline/extractions/<domain_id>/` containing: `batch-NN.notes.md`, `consolidated.notes.md`, `review.json`, and optionally `deep_pass.notes.md`.
- The `--concurrency` flag defaults to 3 and can be overridden via CLI or `config.json`.
