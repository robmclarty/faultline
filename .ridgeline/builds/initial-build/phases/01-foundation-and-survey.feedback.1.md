# Reviewer Feedback: Phase 01-foundation-and-survey

## Failed Criteria

### Criterion 18
**Status:** FAIL
**Evidence:** Most test areas covered (token estimation, file walker, batch packing, state, budget, learnings, validation, manifest, prompt, response parsing — 79 tests total). However, config resolution tests (config.test.ts) only verify CLI flags override defaults. Criterion explicitly requires testing 'CLI flags override config.json which overrides defaults' — the config.json middle tier is absent from both config.ts implementation and its tests.
**Required state:** resolve_config() must load and merge a config.json file from the output directory (if it exists) as a middle tier between defaults and CLI flags. Tests must verify: (1) defaults alone, (2) config.json overrides defaults, (3) CLI flags override config.json, (4) missing config.json gracefully falls back to defaults.

## Issues

- Config resolution is missing the config.json middle tier. Criterion 18 requires unit tests for 'config resolution (CLI flags override config.json which overrides defaults)'. The implementation in stores/config.ts only merges CLI flags over hardcoded defaults — there is no code to read or parse a config.json file from the .faultline/ directory. The config.test.ts tests consequently only verify the two-tier resolution (CLI over defaults). The three-tier chain described in the criterion is not implemented or tested. (src/stores/config.ts)
  - **Required:** resolve_config() must load and merge a config.json file from the output directory (if it exists) as a middle tier between defaults and CLI flags. Tests must verify: (1) defaults alone, (2) config.json overrides defaults, (3) CLI flags override config.json, (4) missing config.json gracefully falls back to defaults.

## What Passed

- Criterion 1: `npm run build` (tsc) completes with zero errors. Output in dist/.
- Criterion 2: `npm test` passes: typecheck + lint (oxlint, markdownlint, agnix, fallow) + 79 vitest tests, zero failures, zero warnings.
- Criterion 3: `npx faultline --help` lists all 7 subcommands: analyze, survey, extract, reconcile, synthesize, dry-run, status.
- Criterion 4: `npx faultline status ./test/fixtures/sample-app` prints 'No pipeline state found' and exits with code 0.
- Criterion 5: test/fixtures/sample-app/ has 12 directories, 21 files including package.json, README.md, .eslintrc.json, JS source files, config JSON, CSS, HTML, docs, scripts, and tests — sufficient variety.
- Criterion 6: survey.exec.ts calls walk_files() which populates path, size_bytes, tokens_est, extension, language, category for every file, then writes via write_file_index(). File walker tests confirm all fields populated (file_walker.test.ts lines 60-69).
- Criterion 7: survey.exec.ts calls parse_manifest() for package.json parsing, writes via write_manifest(). Manifest parser tested with fixture (manifest_parser.test.ts).
- Criterion 8: survey.exec.ts calls generate_tree() and writes via write_tree(). Tree generation tested (file_walker.test.ts lines 97-104).
- Criterion 9: Domain mapping via Claude produces domains with all required fields. Domain type in types.ts enforces shape with id, label, description, directories, key_files, estimated_tokens, priority, depends_on, sub_domains. Sub-domain splitting for >80k tokens in domains.md prompt and batcher.ts.
- Criterion 10: Domain review via Claude writes to domain_review.json with passed/issues/suggestions structure. DomainReview type at types.ts:86-90 enforces this shape.
- Criterion 11: build_extraction_tasks() (batcher.ts) creates batched tasks respecting context_budget. Oversized domains (>80k tokens) split by layer order: models/types → routes/controllers → services → tests. Tested in batcher.test.ts.
- Criterion 12: Architecture description generated via Claude using survey/architecture.md template, written to survey/architecture.md via write_architecture() (survey.exec.ts lines 218-237).
- Criterion 13: extract_architecture_learnings() parses cross-cutting observations from architecture.md (survey.exec.ts lines 461-501). append_learnings() writes both learnings.json (active set) and learnings.log.json (full log) (learnings.ts).
- Criterion 14: state.json written after every task status update via write_state(). Phase status tracked with per-step task status (file_index, manifest, tree, classify, domains, domain_review, extraction_plan, architecture, learnings). mark_phase_completed() sets final status.
- Criterion 15: invoke_claude() calls create_budget_entry() + append_budget_entry() after every successful invocation, logging phase, task, model, tokens, and estimated cost to budget.json (invoke.ts lines 137-146).
- Criterion 16: DEFAULT_EXCLUDES in types.ts covers node_modules, vendor, dist, build, .git, lock files, binary/media formats. --include/--exclude flags registered in survey command (survey.ts lines 26-27) and passed to walk_files(). Glob matching tested in file_walker.test.ts.
- Criterion 17: Fixed from previous review. survey.exec.ts line 160: `let final_domains = domains`, reassigned at line 165 `final_domains = await retry_domain_mapping(...)` when review fails. Lines 197-198 and 229 use final_domains for extraction plan and architecture description.
- Criterion 19: compress_active_set() in learnings.ts sorts by RETENTION_PRIORITY: hypothesis=1, observation=2, pattern=3, contradiction=4. Tests at learnings.test.ts verify contradictions survive compression and hypotheses are dropped first.
- Criterion 20: invoke.ts: timeout via setTimeout + proc.kill('SIGTERM') (lines 222-227), retry with exponential backoff BASE_DELAY * 2^(attempt-1) (lines 119-124), cost logged via create_budget_entry + append_budget_entry (lines 138-146). Process registry tracks active processes for SIGINT cleanup.
- Criterion 21: Fixed from previous review. All store modules validate before writing: survey.ts (manifest, domains, domain_review, extraction_plan, architecture), extractions.ts (batch_notes, consolidated_notes), learnings.ts line 106 calls validate_token_ceiling(serialized, LEARNINGS_FILE) before writeFile.
- Criterion 22: Survey templates exist: src/agents/survey/classify.md, domains.md, review.md, architecture.md. Shared templates: src/agents/shared/abstraction_rules.md, ridgeline_format.md. All are markdown files.
- Criterion 23: Barrel index.ts files verified: src/commands/index.ts (7 exports), src/engine/index.ts (15 exports), src/stores/index.ts (20+ exports), src/ui/index.ts (13 exports).
