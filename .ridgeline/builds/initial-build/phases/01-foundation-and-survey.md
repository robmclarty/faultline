# Phase 1: Foundation & Survey Pipeline

## Goal

Stand up the entire project foundation and deliver a fully working survey phase. By the end of this phase, a user can run `faultline survey ./some-project` and get a complete `.faultline/survey/` directory with all artifacts needed to plan extraction: file index, dependency manifest, tree listing, domain classifications, domain review, extraction plan, and architecture description. The learnings system is initialized with cross-cutting architectural insights.

This is the first interactive, demonstrable milestone. It validates every layer of the system — CLI argument parsing, file traversal, Claude subprocess management, prompt template loading, response parsing, state persistence, budget tracking, and the two-tier learnings system — against a real pipeline use case rather than stubs.

## Context

This is the first phase. The project starts from scratch — no existing code, no dependencies installed, no configuration. The builder must establish the TypeScript project, install all dependencies, configure the build toolchain, and create the complete directory structure before implementing any pipeline logic.

## Acceptance Criteria

1. `npm run build` compiles the TypeScript project successfully with zero errors
2. `npm test` passes with zero failures and zero lint warnings (vitest + oxlint + markdownlint)
3. `npx faultline --help` prints usage information listing all subcommands: analyze, survey, extract, reconcile, synthesize, dry-run, status
4. `npx faultline status ./some-dir` reports "no pipeline state found" (or equivalent) when no `.faultline/` directory exists, and exits with code 0
5. A test fixture directory exists at `test/fixtures/sample-app/` with enough structure (multiple directories, dependency manifest, README, config files, varied file types) to exercise the full survey pipeline
6. `npx faultline survey ./test/fixtures/sample-app` produces `.faultline/survey/file_index.json` containing an entry for every non-excluded file with path, size_bytes, tokens_est, extension, language, and category fields populated
7. `npx faultline survey ./test/fixtures/sample-app` produces `.faultline/survey/manifest.json` parsed from the fixture's package.json (or equivalent dependency manifest)
8. `npx faultline survey ./test/fixtures/sample-app` produces `.faultline/survey/tree.txt` with the full recursive file listing
9. `npx faultline survey ./test/fixtures/sample-app` produces `.faultline/survey/domains.json` with domain entries including id, label, description, directories, key_files, estimated_tokens, priority, depends_on, and sub_domains (when a domain exceeds 80k estimated tokens)
10. `npx faultline survey ./test/fixtures/sample-app` produces `.faultline/survey/domain_review.json` with a passed/issues/suggestions structure
11. `npx faultline survey ./test/fixtures/sample-app` produces `.faultline/survey/extraction_plan.json` with batched tasks where each batch respects the configured context budget, and oversized domains are split by layer (models/types first, routes/controllers second, services third, tests fourth)
12. `npx faultline survey ./test/fixtures/sample-app` produces `.faultline/survey/architecture.md` describing the current system architecture
13. `npx faultline survey ./test/fixtures/sample-app` produces `.faultline/learnings.json` and `.faultline/learnings.log.json` with initial entries extracted from the architecture description's cross-cutting observations
14. `npx faultline survey ./test/fixtures/sample-app` produces `.faultline/state.json` showing the survey phase as completed, with per-step status tracking
15. `npx faultline survey ./test/fixtures/sample-app` produces `.faultline/budget.json` with cost entries for each Claude invocation during survey
16. The file walker respects default excludes (node_modules, vendor, dist, build, .git, lock files, binary/media formats) and honors `--include`/`--exclude` flags
17. If domain review fails, the domain mapper is retried once with review feedback before proceeding
18. Unit tests exist and pass for: token estimation (code files use ceil(bytes/4), prose uses ceil(bytes/5)), file walker glob matching (include and exclude patterns), batch packing (items packed greedily within budget, oversized items split), config resolution (CLI flags override config.json which overrides defaults), state read/write round-trip, budget append and read, learnings active set enforcement (entries exceeding 3k tokens trigger compression with correct retention priority ordering), learnings domain filtering, manifest parsing for at least package.json format, prompt template loading and {{variable}} interpolation, response parsing (extracting JSON blocks and markdown sections from mixed Claude output)
19. The learnings store correctly preserves contradiction-type entries during compression and drops hypothesis-type entries first
20. The Claude invocation wrapper handles timeout enforcement (kills child process), retry with exponential backoff on non-zero exit codes, and logs cost to the budget store
21. All store modules validate the 5k token ceiling before writing any file intended for Claude consumption, raising an error if exceeded
22. All survey prompt templates exist as markdown files under `src/agents/survey/` and shared templates exist under `src/agents/shared/`
23. Every top-level folder under `src/` (commands/, engine/, stores/, ui/) has a barrel `index.ts` re-exporting its public API

## Spec Reference

The survey phase (Phase 1 of the faultline pipeline) maps an unknown codebase into a structured extraction plan through six steps: file indexing (1a, harness-only), batched file classification (1b, Claude, ~8k files per batch), domain mapping (1c, Claude, single invocation using compressed directory-level summaries), adversarial domain review (1c', sonnet model, checks for orphaned directories, thin domains, overloaded cross-cutting, missing dependency edges, oversized domains without sub-domains), domain sampling validation (1c'', harness selects representative files, Claude validates assignments), extraction plan generation (1d, harness-only, batches by token budget with layer-based splitting), and architecture description (1e, Claude, produces architecture.md with cross-cutting observations for the learnings system).

The project infrastructure includes: TypeScript on Node.js 22+ with ES modules, commander for CLI, vitest for testing, oxlint for linting, the Claude `--print` subprocess wrapper with timeout/retry/cost capture, prompt templates with `{{variable}}` interpolation loaded from `src/agents/`, the two-tier learnings system (append-only full log + bounded 3k-token active set with structural retention priorities), state persistence for resumability, and budget tracking per invocation. The token budget model allocates 150k working tokens per invocation. File size invariant: no Claude-bound file exceeds 5k tokens.
