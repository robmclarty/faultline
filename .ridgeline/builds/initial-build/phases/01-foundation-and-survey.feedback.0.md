# Reviewer Feedback: Phase 01-foundation-and-survey

## Failed Criteria

### Criterion 17
**Status:** FAIL
**Evidence:** Retry logic exists at survey.exec.ts:160-183 — when review.passed is false, retry_domain_mapping() is called and retry_domains are written to disk. However, line 191 sets `final_domains = domains` (the ORIGINAL domains), not retry_domains. Extraction plan (line 198) and architecture description (line 216) use stale original domains after a retry.
**Required state:** After domain review retry, subsequent pipeline steps (extraction plan, architecture description) must use the retried domains. The `final_domains` variable should reference `retry_domains` when a retry occurred.

### Criterion 21
**Status:** FAIL
**Evidence:** validate_token_ceiling is called in: survey.ts (manifest, domains, domain_review, extraction_plan, architecture), extractions.ts (batch_notes, consolidated_notes). NOT called in: learnings.ts before writing learnings.json. learnings.json is intended for Claude consumption (loaded as context in extraction phase via get_domain_learnings). The 3k compression provides implicit protection but the explicit validation required by this criterion is missing.
**Required state:** append_learnings() must call validate_token_ceiling() on the serialized active set content before writing learnings.json to disk.

## Issues

- survey.exec.ts line 191: `const final_domains = domains` uses the original domain mapping after a retry. When domain review fails and retry_domain_mapping() produces new domains, the extraction plan (line 198) and architecture description (line 216) still use the original domains. The retried domains are written to disk but not used in subsequent pipeline steps. (src/engine/pipeline/survey.exec.ts)
  - **Required:** After domain review retry, subsequent pipeline steps (extraction plan, architecture description) must use the retried domains. The `final_domains` variable should reference `retry_domains` when a retry occurred.
- learnings.ts writes learnings.json without calling validate_token_ceiling(). learnings.json is loaded as context for Claude during extraction (via get_domain_learnings). The 3k token compression provides implicit protection, but the criterion requires explicit validation before writing any Claude-bound file. (src/stores/learnings.ts)
  - **Required:** append_learnings() must call validate_token_ceiling() on the serialized active set content before writing learnings.json to disk.

## What Passed

- Criterion 1: `npm run build` (tsc) completes with zero errors. Output in dist/.
- Criterion 2: `npm test` passes: typecheck + lint (oxlint, markdownlint, agnix, fallow) + 79 vitest tests, zero failures, zero warnings.
- Criterion 3: `npx faultline --help` lists all 7 subcommands: analyze, survey, extract, reconcile, synthesize, dry-run, status.
- Criterion 4: `npx faultline status ./test/fixtures/sample-app` prints 'No pipeline state found' and exits with code 0.
- Criterion 5: test/fixtures/sample-app/ has 8 directories (src/, config/, docs/, scripts/, public/, test/) with package.json, README.md, .eslintrc.json, 13 .js files, 4 .json files, CSS, HTML — sufficient variety.
- Criterion 6: survey.exec.ts calls walk_files() which populates path, size_bytes, tokens_est, extension, language, category for every file, then writes via write_file_index() to survey/file_index.json. File walker tests confirm all fields populated.
- Criterion 7: survey.exec.ts calls parse_manifest() for package.json parsing, writes via write_manifest() to survey/manifest.json. Manifest parser tested with fixture.
- Criterion 8: survey.exec.ts calls generate_tree() and writes via write_tree() to survey/tree.txt. Tree generation tested.
- Criterion 9: Domain mapping via Claude produces domains with all required fields (id, label, description, directories, key_files, estimated_tokens, priority, depends_on, sub_domains). Domain type definition in types.ts enforces this shape. Sub-domain splitting for >80k tokens is in domains.md prompt and batcher.ts.
- Criterion 10: Domain review via Claude writes to survey/domain_review.json with passed/issues/suggestions structure. DomainReview type enforces this.
- Criterion 11: build_extraction_tasks() creates batched tasks respecting context_budget. Oversized domains (>80k tokens) split by layer (models/types → routes/controllers → services → tests). Tested in batcher.test.ts.
- Criterion 12: Architecture description generated via Claude, written to survey/architecture.md via write_architecture().
- Criterion 13: extract_architecture_learnings() parses cross-cutting observations from architecture.md. append_learnings() writes both learnings.json (active set) and learnings.log.json (full log).
- Criterion 14: state.json written after every task status update via write_state(). Phase status tracked with per-step task status (file_index, manifest, tree, classify, domains, domain_review, extraction_plan, architecture, learnings). mark_phase_completed() sets final status.
- Criterion 15: invoke_claude() calls append_budget_entry() after every successful Claude invocation, logging phase, task, model, tokens, and estimated cost to budget.json.
- Criterion 16: DEFAULT_EXCLUDES in types.ts covers node_modules, vendor, dist, build, .git, lock files, binary/media formats. --include/--exclude flags registered in survey command and passed to walk_files(). Glob matching tested in file_walker.test.ts.
- Criterion 18: All required test areas covered: token estimation (6 tests), file walker glob (15 tests), batch packing (6 tests), config resolution (5 tests), state round-trip (10 tests), budget append/read (5 tests), learnings active set enforcement + domain filtering (7 tests), validation ceiling (3 tests), manifest parsing (4 tests), prompt template interpolation (5 tests), response parsing (13 tests). Total: 79 tests, all passing.
- Criterion 19: compress_active_set() sorts by RETENTION_PRIORITY (hypothesis=1, observation=2, pattern=3, contradiction=4). Keeps highest-priority entries. Tests verify contradictions survive compression and hypotheses are dropped first (learnings.test.ts lines 82-108).
- Criterion 20: invoke.ts: timeout via setTimeout + proc.kill('SIGTERM') (line 222-227), retry with exponential backoff BASE_DELAY * 2^(attempt-1) (line 121), cost logged via append_budget_entry (lines 138-146). Process registry tracks active processes for SIGINT cleanup.
- Criterion 22: Survey templates: src/agents/survey/classify.md, domains.md, review.md, architecture.md. Shared templates: src/agents/shared/abstraction_rules.md, ridgeline_format.md. All exist as markdown files.
- Criterion 23: Barrel index.ts files verified: src/commands/index.ts (7 exports), src/engine/index.ts (15 exports), src/stores/index.ts (20+ exports), src/ui/index.ts (13 exports).
