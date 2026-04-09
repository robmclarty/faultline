# Phase 2: Extraction Pipeline

## Goal

Implement the complete extraction phase that reads actual source code for each domain and produces observation notes capturing business rules, data invariants, gaps, and cross-domain observations — all in product language, never implementation language. This is the most compute-intensive and architecturally complex phase of the pipeline, with parallel execution, multi-batch serial handoff, review loops, deep passes for high-priority domains, and continuous learnings management all interacting.

By the end of this phase, running `faultline extract ./some-project` (after survey) produces reviewed, consolidated notes for every domain, with extraction review verdicts, deep pass notes for high-priority domains where gaps were identified, and an updated learnings system carrying cross-domain insights forward for reconciliation and synthesis.

## Context

Phase 1 delivered the complete project foundation and a working survey pipeline. The following infrastructure is available and tested: CLI binary with all subcommands wired, Claude subprocess invocation with timeout/retry/cost capture, prompt template loading with {{variable}} interpolation, response parsing for JSON and markdown blocks, the two-tier learnings system, state persistence with per-step tracking, budget logging, file walker, token estimator, and batch planner.

The survey pipeline has produced all artifacts the extraction phase consumes: `file_index.json` (every file classified with category, language, token estimate), `domains.json` (domain structure with priorities, dependencies, sub-domains), `extraction_plan.json` (concrete batched tasks with token budgets and layer-based splitting for oversized domains), `architecture.md`, and initialized `learnings.json`/`learnings.log.json`.

The extraction plan contains tasks that are independent at the domain level (can run in parallel) but serial within multi-batch domains (each batch needs the prior batch's notes as handoff context).

## Acceptance Criteria

1. `npm test` passes with zero failures and zero lint warnings
2. All extraction prompt templates exist as markdown files: `src/agents/extract/system.md`, `consolidate.md`, `review.md`, `deep_pass.md`, `validate_feedback.md`
3. `npx faultline extract ./test/fixtures/sample-app` (after survey) produces per-domain directories under `.faultline/extractions/` containing batch notes and `consolidated.notes.md`
4. Each `consolidated.notes.md` is under 5,000 tokens (~20,000 characters) and contains sections for Business Rules Observed, Data Invariants, Gaps & Ambiguities, and Cross-Domain Observations
5. For domains with multiple batches, individual `batch-NN.notes.md` files are preserved in the domain's extraction directory
6. Multi-batch extraction correctly passes prior batch notes (compressed to ~2k tokens) as handoff context to subsequent batches, and includes a "Notes for Next Batch" section in each batch's output
7. Each domain's extraction directory contains a `review.json` with the extraction reviewer's structured verdict (passed/issues/suggestions)
8. Extraction review detects abstraction violations by scanning for framework keywords from `manifest.json` and flags them in the verdict
9. When extraction review fails (`passed: false`), the consolidation agent retries once with review feedback appended, then proceeds regardless
10. For domains marked `priority: "high"` where the reviewer had suggestions, a `deep_pass.notes.md` exists and its findings are merged into the consolidated notes (while respecting the 5k token ceiling)
11. The deep pass is skipped for high-priority domains where the extraction review passed cleanly with no suggestions
12. The `--skip-deep-pass` flag suppresses deep extraction even for high-priority domains
13. Cross-domain observations from consolidation are appended to both `learnings.log.json` and `learnings.json`
14. Each extraction batch invocation receives learnings entries filtered to the current domain (entries where `relevant_domains` includes this domain, plus all `shared_invariant` and `contradiction` entries)
15. The active learnings set (`learnings.json`) stays within the 3k token budget, with compression triggered when it would be exceeded
16. Extraction tasks run in parallel up to the `--concurrency` limit (default 3), with the process registry tracking all live Claude subprocesses
17. `.faultline/state.json` tracks each extraction task's status individually (not just phase-level), enabling resume of partially-completed extraction runs
18. `.faultline/budget.json` logs every Claude invocation during extraction with model, estimated input tokens, estimated output tokens, and estimated cost
19. Output validation checks that every source file in the extraction plan is referenced at least once in the domain's consolidated notes (simple filename grep)
20. Failed validation checks trigger a retry (up to `--max-retries`, default 2) with feedback appended to the prompt
21. Unit tests exist with mocked Claude invocations covering: single-batch extraction, multi-batch serial extraction with handoff context, consolidation merging, review feedback loop (pass and fail cases), deep pass triggering logic, parallel execution respecting concurrency limits, and learnings append flow

## Spec Reference

The extraction phase (Phase 2) processes each task from `extraction_plan.json`. Per-batch invocations receive: extraction system prompt, domain context from `domains.json`, architecture digest (~1k tokens), filtered learnings, prior batch notes (if batch > 1, compressed to ~2k tokens), source files with path headers, and related tests if they fit. Each batch produces structured notes with Business Rules Observed, Data Invariants, Gaps & Ambiguities, Cross-Domain Observations, and Notes for Next Batch sections.

Consolidation merges all batch notes per domain into `consolidated.notes.md` — deduplicated, organized, internally consistent, capped at 4,000 words. When raw batch notes exceed 15k tokens combined, aggressive compression is applied (keep rules and invariants, drop implementation observations).

The extraction reviewer (sonnet model) checks for: file coverage (every source file referenced), abstraction violations (framework keywords from manifest), cross-domain dangling references (undeclared dependencies), and gap plausibility (empty gaps for domains with >20k tokens of source is suspicious). One consolidation retry on failure.

The deep extraction pass targets high-priority domains where the reviewer identified gaps. It re-reads a representative subset of source files (~50k tokens, prioritizing files not well-covered per the reviewer) alongside consolidated notes, looking for missed rules, vague descriptions, implicit invariants, and edge cases in error-handling code. Output merges back into consolidated notes within the 5k token ceiling.
