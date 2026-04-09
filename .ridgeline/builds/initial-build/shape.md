# Faultline

## Intent

Reverse-engineer existing codebases into abstract, implementation-independent product requirement documents (PRDs) that describe what an application does at the business-rule level. Teams that want to rebuild, migrate, or simply understand legacy systems need product-level documentation that doesn't exist and is prohibitively expensive to write manually. Faultline automates this reverse-engineering using Claude as the AI backbone, producing specs that can feed directly into Ridgeline for clean reimplementation. The tool must scale to enterprise-sized codebases (20k+ files) that far exceed any single context window.

## Scope

Size: full-system

Boundaries:

**In scope:**
- Working CLI with subcommands: analyze, survey, extract, reconcile, synthesize, dry-run, status
- Phase 1 (Survey): file indexing, batched classification, domain mapping with adversarial review and sampling validation, extraction planning, architecture description
- Phase 2 (Extract): per-domain batched extraction with handoff notes, consolidation, extraction review, deep pass for high-priority domains, retry loops
- Phase 2.5 (Reconcile): cluster-based cross-domain reconciliation detecting duplications, contradictions, and missing handoff points
- Phase 3 (Synthesize): domain summaries, per-domain spec writing, mechanical abstraction enforcement, overview spec, architecture refinement, constraints extraction, taste extraction
- Token-budget-aware batching that plans all Claude invocations against a configurable context ceiling (default 150k tokens)
- Two-tier learnings system: append-only full log (unbounded) + active set (capped at 3k tokens) with typed entries and structural retention priorities
- Zod schema validation for all Claude structured output with retry on validation failure
- Resumable pipeline via state.json — crashed runs resume from last completed task
- Per-invocation cost tracking to budget.json with --max-budget-usd ceiling
- Ridgeline-compatible output with optional --ridgeline flag to write directly into .ridgeline/builds/<name>/
- claude --print invocation layer with timeout, cost capture, retry with exponential backoff, process registry for SIGINT cleanup
- Prompt template system loading .md files from src/agents/ with variable interpolation
- Manifest parsing for major formats: package.json, Cargo.toml, requirements.txt, pyproject.toml, go.mod, Gemfile, pom.xml, build.gradle
- --verbose flag for detailed output plus persistent run.log in .faultline/ for all runs
- dry-run command showing extraction plan, estimated invocation count, total input tokens, and projected cost by model tier
- Graceful interruption: SIGINT kills all live Claude subprocesses then saves pipeline state
- Parallel extraction with configurable --concurrency (default 3)
- All 10 success criteria targeted, with minimum viable bar: full pipeline on real codebase, abstraction-clean specs, full domain coverage, resumability, Ridgeline compatibility

**Out of scope:**
- Actually reimplementing or executing the analyzed codebase
- Real-time or interactive analysis — this is a batch pipeline
- Multi-language support beyond file extension detection (no compilation, AST parsing, or execution)
- Consumer-driven learnings views (noted as future evolution)
- Citation tracking for learnings entries
- Phase-aware recompression of the active learnings set
- shapes/ output directory (marked optional, deferred)
- Interactive/TUI mode for reviewing intermediate artifacts
- Monorepo-aware multi-application splitting (noted as edge case risk, not a solved requirement)

## Solution Shape

Faultline is a TypeScript CLI tool that operates as a deterministic, resumable pipeline orchestrator with Claude as the reasoning engine. The user points it at a codebase directory and it produces a structured set of product requirement documents.

The pipeline has four phases, each producing bounded intermediate artifacts that serve as explicit handoff context to the next phase:

Phase 1 (Survey) maps the codebase: the harness indexes every file, Claude classifies files and proposes domain groupings, an adversarial reviewer validates domain assignments, sampling checks catch misclassifications, and the harness produces a concrete extraction plan with token budgets per batch.

Phase 2 (Extract) reads actual source code per domain: each domain's files are batched within the token budget, Claude produces observation notes per batch, a consolidation step merges batch notes into a single ≤5k-token document per domain, a reviewer checks for coverage and abstraction violations, and high-priority domains get a deep second pass.

Phase 2.5 (Reconcile) detects cross-domain issues: the harness clusters related domains by dependency edges and observed references, Claude compares each cluster's consolidated notes to find contradictions, duplications, missing handoff points, and undeclared dependencies.

Phase 3 (Synthesize) produces final deliverables: domain notes are compressed to 500-token summaries, each domain gets one or more spec files written in pure product language, a mechanical abstraction scan catches implementation leakage, and system-level documents (overview, architecture, constraints, taste) round out the output.

The learnings system is the connective tissue — cross-cutting observations discovered at each step are appended to a two-tier log (full append-only + bounded active set) and carried forward to subsequent steps, so that no phase operates in isolation despite fresh context windows.

The primary audience is developers and tech leads preparing for reimplementation. The direct output consumer is Ridgeline or a human reader. The tool operator needs the Claude Code CLI installed and a codebase to analyze.

## Risks & Complexities

- Monorepos with multiple distinct applications sharing code — the domain mapper may struggle to draw clean boundaries between applications that share utility code, data models, or infrastructure
- Claude output unpredictability — despite Zod validation and retries, Claude may produce structurally valid but semantically poor output (e.g., overly vague domain descriptions, missed business rules). The review agents mitigate but cannot eliminate this.
- Cross-domain signal loss at context boundaries — the learnings system and reconciliation phase mitigate this, but subtle invariants that span many domains may still be lost or described inconsistently. This is the fundamental tension of phased execution.
- Token estimation accuracy — the 4-chars-per-token heuristic is approximate. Codebases with unusual character distributions (dense comments, unicode, minified code that wasn't excluded) could cause budget overruns or underutilization.
- Oversized domains that resist clean batching — when a domain's files have tight interdependencies, splitting by layer (models → routes → services) may lose critical context about how layers interact within the same batch.
- Cost unpredictability for very large codebases — while dry-run provides estimates, actual cost depends on retry frequency, domain count, and how many domains trigger deep passes. The --max-budget-usd ceiling is a hard stop but may produce incomplete results.
- claude --print CLI dependency — the tool requires Claude Code to be installed, which is an unusual runtime dependency for a CLI tool. Version compatibility between Faultline and Claude Code could become a maintenance concern.
- Abstraction enforcement false positives — the mechanical scan for implementation language may flag legitimate domain terminology that happens to overlap with technical terms (e.g., a domain called 'router' or 'cache'), requiring manual override or smart allowlisting.
- Manifest parsing breadth — supporting 6+ manifest formats (package.json, Cargo.toml, requirements.txt, pyproject.toml, go.mod, Gemfile, pom.xml, build.gradle) is a significant surface area for edge cases and version-specific format variations.
- Reconciliation cluster quality — the heuristic for splitting oversized connected components (remove weakest edges) may separate domains that genuinely need to be compared together, missing contradictions that only surface when all related domains are in the same context.

## Existing Landscape

Greenfield TypeScript project with ESM modules. Project scaffold exists (package.json, CLAUDE.md, vitest.config.ts, linting configs) but no src/ directory or source code yet. The project is set up to be built using Ridgeline — a detailed spec already lives at .ridgeline/builds/initial-build/spec.md. Toolchain is established: commander for CLI, vitest for testing, oxlint for code linting, markdownlint-cli2 for markdown, agnix for agent prompt linting, fallow for dead code detection. Conventional Commits enforced. Test files expected at src/**/__tests__/**/*.test.ts.

**External dependencies:**
- Claude Code CLI (claude --print) — the sole runtime AI dependency, used for all LLM invocations
- commander (13.0.0) — CLI framework, already installed
- Zod — schema validation for Claude output (to be added)
- Node.js built-in fs/path/child_process — file system traversal, process spawning
- Ridgeline — both the build harness for constructing Faultline and the downstream consumer of its output

**Data structures:**
- file_index.json — every file in the target codebase: path, size, tokens estimate, extension, language, category, domain hint
- manifest.json — parsed dependency manifests from the target codebase
- domains.json — domain classifications with labels, descriptions, directories, key files, token estimates, priorities, dependencies, and sub-domains
- domain_review.json — adversarial reviewer verdict with typed issues and suggestions
- extraction_plan.json — concrete list of extraction tasks with per-batch file lists and token budgets
- learnings.log.json — full append-only log of cross-cutting observations, typed entries (data_contract, shared_invariant, contradiction, pattern, hypothesis)
- learnings.json — active set, bounded at 3k tokens, curated view of the full log with structural retention priorities
- state.json — pipeline progress tracking with per-phase and per-task status for resume detection
- budget.json — per-invocation cost tracking
- config.json — run configuration and thresholds
- cross_references.json — cross-domain reconciliation findings (duplicate rules, missing handoffs, shared invariants, undeclared dependencies)
- domain_summaries.json — compressed 500-token summaries of all domains for synthesis context
- Per-domain batch notes (batch-NN.notes.md), consolidated notes, review verdicts, and deep pass notes

**Relevant modules:**
- src/agents/ — prompt templates organized by phase (survey/, extract/, reconcile/, synthesize/, shared/)
- src/engine/claude/ — invoke.ts (claude --print wrapper), prompt_loader.ts (template interpolation), response_parser.ts (output extraction + Zod validation)
- src/engine/pipeline/ — phase orchestrators: survey.exec.ts, extract.exec.ts, reconcile.exec.ts, synthesize.exec.ts
- src/engine/ — batcher.ts (token-budget-aware batch planning), file_walker.ts (recursive traversal), token_estimator.ts (bytes to tokens)
- src/stores/ — config.ts, state.ts, budget.ts, learnings.ts, survey.ts, extractions.ts, output.ts
- src/ui/ — log.ts (structured logging), spinner.ts (progress indicator)

## Technical Preferences

- **Error handling:** Two-tier error handling: thrown exceptions for hard failures that should halt the pipeline (Claude unreachable, filesystem errors, budget ceiling exceeded), and discriminated return types (success/failure objects) for recoverable errors (validation failures, review failures, retry-worthy situations). The guiding philosophy is 'proceed with warnings' — retry up to configured limits, then continue with logged warnings unless the failure is unrecoverable. Warnings always surface to the user even in non-verbose mode. All errors logged to .faultline/run.log regardless of verbosity setting.
- **Performance:** Expected cost for a 5k-file codebase: $15-40 USD with Opus for extraction/reconciliation/synthesis and Sonnet for survey/review steps. Token budget of 150k per invocation is configurable. Parallel extraction with configurable --concurrency (default 3). dry-run command provides estimated invocation count, total input tokens, and projected cost by model tier before committing to a run. The pipeline is designed for throughput over latency — it's a batch tool, not interactive.
- **Security:** No secrets handling beyond requiring the user to have Claude Code CLI authenticated. The tool reads arbitrary codebases which may contain secrets — Faultline should never include raw source code in its output specs (the abstraction enforcement handles this). No network access beyond Claude invocations. All intermediate and output artifacts are written to local disk only.
- **Trade-offs:** Fresh context windows over compaction — accept some cross-batch coherence loss in exchange for predictable token budgets, natural resume points, and parallelizability. Proceed with warnings over blocking — accept imperfect intermediate results over halting the pipeline, since downstream phases can compensate. Separate constructive and adversarial roles (mapper vs reviewer, extractor vs reviewer) — accept additional invocation cost in exchange for better coverage and correctness. Small dependency footprint — accept reimplementing simple utilities over pulling in heavy dependency trees.
- **Style:** TypeScript with ESM modules. Functional style with module-level exports, no classes. Direct imports preferred over barrel files. Conventional Commits for version control. Tests colocated at src/**/__tests__/**/*.test.ts using vitest. Prompt templates as .md files in src/agents/ with {{variable}} interpolation. oxlint for code linting, markdownlint-cli2 for markdown, agnix for agent prompt linting. Zod for runtime schema validation. Minimal runtime dependencies — commander and Zod as the primary additions to Node built-ins.
