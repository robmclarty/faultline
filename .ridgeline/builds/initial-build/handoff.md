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
