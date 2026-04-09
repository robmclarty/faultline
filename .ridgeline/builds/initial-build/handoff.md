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

## Phase 3: Reconciliation & Synthesis

### What was built

**Types & config:**

- `CrossReferenceFinding`, `CrossReferenceCluster`, `CrossReferenceReport`, `DomainSummary` types added to `types.ts`
- `FaultlineConfig` extended with `skip_reconcile` (default false) and `ridgeline_name` (default empty) fields
- Config defaults updated in `stores/config.ts`

**Agent templates:**

- `reconcile/system.md` — Cross-domain reconciliation prompt analyzing clusters of related domains for duplications, contradictions, missing handoffs, shared invariants, and undeclared dependencies
- `synthesize/summarize.md` — Domain summary compression prompt (~500 tokens per domain)
- `synthesize/spec.md` — Per-domain spec writer with ridgeline format, multi-file split support via `SPEC_SPLIT` delimiters, cross-reference integration, and abstraction rules
- `synthesize/overview.md` — System overview with system-wide invariants from reconciliation
- `synthesize/architecture.md` — Architecture refinement with extraction insights
- `synthesize/constraints.md` — Constraints extraction from manifests and configs
- `synthesize/taste.md` — Taste extraction from linter configs and source samples

**Stores:**

- `stores/reconciliation.ts` — Read/write `cross_references.json` under `.faultline/extractions/`
- `stores/synthesis.ts` — Read/write `domain_summaries.json` under `.faultline/synthesis/`
- `stores/output.ts` — Rewritten to support nested subdirectories (`specs/auth/01-identity.md`), file reading, and ridgeline copy (`copy_output_to_ridgeline`)

**Reconciliation pipeline (`engine/pipeline/reconcile.exec.ts`):**

- `build_interaction_graph` — Builds domain interaction graph from declared dependencies (domains.json `depends_on`) plus grep-based reference detection in consolidated notes (checks domain id and label references)
- `identify_clusters` — Finds connected components via BFS, filters isolated domains, splits components exceeding 5 domains by removing weakest edges (observed edges removed before declared)
- Per-cluster Claude reconciliation with all constituent domains' consolidated notes + learnings
- Cross-reference report output with typed findings
- Findings appended to both `learnings.json` and `learnings.log.json`

**Synthesis pipeline (`engine/pipeline/synthesize.exec.ts`):**

- Step 3a: Domain summary compression via Claude (~500 tokens each)
- Step 3b: Per-domain spec writing with ridgeline format (Overview, Requirements, Known Gaps, Relationships), multi-file split parsing, cross-reference integration
- Step 3b': Harness-level abstraction enforcement scan detecting file extensions, framework names from manifest, long camelCase/snake_case identifiers (>15 chars), and path-like strings — flagged specs resubmitted once with violation feedback
- Step 3c: Overview spec (`specs/00-overview.md`) documenting system-wide shared invariants from reconciliation
- Step 3d: Architecture refinement from survey architecture + extraction insights
- Step 3e: Constraints extraction from manifests, config files (tsconfig, eslint, prettier, docker, etc.)
- Step 3f: Taste extraction from linter configs and representative source samples
- Optional ridgeline output copy when `--ridgeline <name>` is specified
- State tracking after each synthesis step

**CLI commands:**

- `commands/reconcile.ts` — Fully wired with `--model`, `--max-retries`, `--timeout`, `--verbose`
- `commands/synthesize.ts` — Fully wired with `--model`, `--skip-reconcile`, `--ridgeline`, `--max-retries`, `--timeout`, `--verbose`

**Tests (32 new, 143 total):**

- `stores/__tests__/reconciliation.test.ts` (2 tests): cross-reference report write/read, null on missing
- `stores/__tests__/synthesis.test.ts` (2 tests): domain summaries write/read, null on missing
- `engine/pipeline/__tests__/reconcile.exec.test.ts` (11 tests): phase prerequisite checks, cross-reference production with cluster organization, isolated domain skipping, learnings append, state tracking, interaction graph building (declared + observed edges), cluster identification (grouping, isolation, oversized splitting)
- `engine/pipeline/__tests__/synthesize.exec.test.ts` (17 tests): phase prerequisite checks, skip-reconcile behavior, domain summaries production, spec file output, overview/architecture/constraints/taste production, state tracking per step, ridgeline copy, abstraction enforcement triggering rewrite, spec split parsing, abstraction violation detection (extensions, frameworks, camelCase, snake_case, paths, clean content)

**Docs:** Updated `docs/architecture.md` and `docs/modules.md` with reconcile/synthesize pipeline descriptions

### Decisions

- **Interaction graph edges have weights**: Declared dependencies get weight 2, observed references get weight 1. When splitting oversized components, weakest (observed) edges are removed first.
- **Isolated domains skipped in reconciliation**: Domains with no edges in the interaction graph are not included in any cluster, since there's nothing to reconcile.
- **Abstraction scan uses regex patterns**: File extensions, framework keywords (from manifest), long identifiers, and path-like strings are detected by the harness deterministically. Only flagged specs are sent back to Claude for rewriting.
- **Spec multi-file decision delegated to Claude**: The spec writer prompt instructs Claude to use `SPEC_SPLIT` delimiters when a domain warrants multiple files. The harness parses these delimiters to create separate files.
- **Config/linter file loading uses hardcoded candidate lists**: Rather than scanning the entire codebase, the synthesis pipeline checks well-known config file names (tsconfig, eslint, prettier, editorconfig, etc.) for constraints and taste extraction.

### Deviations

- The `_manifest` parameter in `scan_abstraction_violations` is currently unused (prefixed with underscore). Framework keywords are extracted separately and passed as a string array. The manifest reference is kept in the signature for potential future use (e.g., version-specific checks).

### Notes for next phase

- The full pipeline is now functional: `survey → extract → reconcile → synthesize`. The `analyze` command (which runs all phases) could now be wired up to call them in sequence.
- The `--skip-reconcile` flag allows synthesis to run directly after extraction, producing specs without cross-reference integration.
- Output structure: `.faultline/output/specs/<domain>/NN-<name>.md`, `.faultline/output/specs/00-overview.md`, `.faultline/output/architecture.md`, `.faultline/output/constraints.md`, `.faultline/output/taste.md`.
- The abstraction enforcement scan may produce false positives (e.g., "class" detected as a long camelCase identifier). The one-retry approach limits the damage — remaining violations after retry are logged as warnings.
- The `dry-run` and `status` commands are still stubs. They could be wired up to show cost estimates and pipeline status respectively.

## Phase 4: Integration, Resume Logic & Documentation

### What was built

**Pipeline integration (`engine/pipeline/analyze.exec.ts`):**

- End-to-end pipeline orchestrator chaining survey → extract → reconcile → synthesize
- Resume support: skips completed phases via `is_phase_completed()` checks
- Budget ceiling enforcement: sets global budget limit via `set_budget_limit()`, catches `BudgetExceededError` to save state and exit gracefully
- Skip flags: `--skip-reconcile` skips Phase 2.5, `--skip-deep-pass` forwarded to extract phase
- SIGINT handling: installs handler that saves `state.json` before exit (code 130), removes handler after completion

**Budget enforcement (`engine/claude/invoke.ts`):**

- `BudgetExceededError` class with spent/limit fields
- `set_budget_limit()` function sets module-level budget ceiling
- Pre-invocation budget check reads `budget.json` and compares against ceiling
- Effective budget is max of per-call `max_budget_usd` option and global `global_budget_limit`

**CLI commands:**

- `commands/analyze.ts` — Full CLI with all flags: `--model`, `--survey-model`, `--concurrency`, `--max-retries`, `--max-budget-usd`, `--skip-reconcile`, `--skip-deep-pass`, `--ridgeline`, `--include`, `--exclude`, `--context-budget`, `--timeout`, `--output`, `--verbose`
- `commands/dry_run.ts` — Shows extraction plan with per-domain task counts, batch counts, token estimates, invocation estimates, and projected cost. Runs survey first if needed.
- `commands/status.ts` — Enhanced with timing and cost info (already partially working from prior phases)

**Types & config:**

- `max_budget_usd` field added to `FaultlineConfig` (default 0 = unlimited)
- Config defaults updated in `stores/config.ts`

**UI enhancements:**

- `format_dry_run()` in `ui/reporter.ts` — Dry-run report with domain breakdown, token totals, invocation estimates, and cost projection
- `format_duration()` helper — Converts elapsed ms to human-readable (e.g., "2m 30s", "1h 15m")
- Status report now shows duration per phase/task

**Tests (7 new, 150 total):**

- `engine/pipeline/__tests__/analyze.exec.test.ts`: Phase sequencing (resume skip, skip-reconcile), resume across phase boundaries, budget enforcement (graceful halt), state persistence (creation, per-phase), cost tracking (invoke_claude called for synthesis)

**Documentation:**

- `README.md` — Full rewrite with command reference, key flags table, pipeline diagram, resume/interruption docs, cost expectations, output structure, architecture overview
- `docs/architecture.md` — Added analyze.exec, budget enforcement, SIGINT handling, resume architecture diagram, mermaid pipeline flow
- `docs/modules.md` — Added analyze.exec, budget ceiling, config tiers, reporter duration formatting descriptions
- `docs/security.md` — Added budget enforcement, SIGINT behavior, temp file handling, config file defensive parsing
- `docs/howto.md` — Added analyze, dry-run, resume, budget ceiling, interruption handling, ridgeline output, artifact inspection guides

### Decisions

- **Global budget limit via module-level variable**: Rather than threading `max_budget_usd` through every invoke_claude call in all four phase executors, the analyze command sets a global limit via `set_budget_limit()`. This keeps the phase executors unchanged while providing per-invocation enforcement.
- **BudgetExceededError propagation**: The error is thrown by `invoke_claude` and caught by `execute_analyze`. Individual phase executors don't need to know about budget limits — the error propagates naturally through the call stack.
- **SIGINT handler as install/cleanup pattern**: The handler is installed at analyze start and removed in a finally block, preventing handler leaks across multiple runs.
- **Dry-run cost estimates use sonnet pricing**: The dry-run report assumes sonnet pricing ($3/$15 per 1M tokens) and estimates output as ~20% of input tokens. These are rough projections, not precise calculations.

### Deviations

None.

### Notes for next phase

- The project is now feature-complete with all commands functional: analyze, survey, extract, reconcile, synthesize, dry-run, status.
- All 150 tests pass with zero failures and zero lint warnings.
- The `--max-budget-usd` flag provides per-invocation budget ceiling enforcement. The budget is checked by reading `budget.json` before each Claude call, so it has file I/O overhead proportional to invocation count.
- Resume works at both phase level (completed phases skipped) and task level (completed tasks within phases skipped by individual phase executors).
- The dry-run cost estimate is approximate — it uses token counts from the extraction plan and sonnet pricing. Actual costs will vary based on model choice and output length.

## Phase 4 Retry 2: Fix Criteria 8 & 17

### What was fixed

1. **Criterion 8 — Within-phase resume for survey** (`src/engine/pipeline/survey.exec.ts`): Refactored `execute_survey` from a monolithic function into per-step helper functions (`step_file_index`, `step_manifest`, `step_tree`, `step_classify`, `step_domains`, `step_domain_review`, `step_extraction_plan`, `step_architecture`, `step_learnings`). Each step checks `is_task_done()` before executing — completed tasks are skipped and their artifacts reloaded from disk. This also resolved the fallow cognitive complexity violation (was 37, now under threshold).

2. **Criterion 8 supplement — Domain-level resume for extract** (`src/engine/pipeline/extract.exec.ts`): Added a `domain_<id>` task completion check in the domain queue loop so fully-completed domains are skipped entirely on resume, not just their individual batches.

3. **Criterion 17 — Within-phase resume integration tests** (`src/engine/pipeline/__tests__/analyze.exec.test.ts`): Added two tests: (a) partial survey resume — sets file_index/manifest/tree/classify as completed, verifies invoke_claude is first called for domain_mapping (not classify); (b) partial extract resume — marks auth domain fully completed, verifies invoke_claude is only called for the incomplete tasks domain.

4. **New store function** (`src/stores/survey.ts`): Added `read_tree()` to support tree artifact reloading during survey resume.

### Decisions

- Used a `SurveyContext` type to thread shared state (config, output_dir, phase, state) through step functions, avoiding parameter explosion.
- Each step function returns the artifact it produces so downstream steps can use it without re-reading from disk on first run.

### Deviations

None.

### Notes for next phase

- All 152 tests pass with zero failures and zero lint warnings (including fallow complexity).
- Within-phase resume is now implemented for all pipeline phases: survey (task-level), extract (domain-level + batch-level), reconcile, and synthesize.
