# Reviewer Feedback: Phase 04-integration-and-documentation

## Failed Criteria

### Criterion 8
**Status:** FAIL
**Evidence:** survey.exec.ts:70-72 unconditionally sets phase.status='running' and re-runs ALL steps. No per-task completion checks exist — update_task_status marks tasks completed but no code checks task status before executing. find_resumable_task exists in stores/state.ts:184 but is never called by survey.exec.ts. Contrast with extract.exec.ts:215 which does check existing_task?.status === 'completed'.
**Required state:** survey.exec.ts must check whether each task (file_index, manifest, tree, classify, domains, domain_review, extraction_plan, architecture, learnings) is already completed before executing it, so that re-running after a mid-survey crash resumes from the first incomplete task rather than re-running the entire survey.

### Criterion 17
**Status:** FAIL
**Evidence:** Tests verify resume across phase boundaries (analyze.exec.test.ts:221 and :270) but do NOT simulate interruption within a phase and verify re-run skips completed work. No test interrupts mid-phase and re-invokes to check task-level skip.
**Required state:** An integration test must simulate partial completion within a phase (e.g., some extraction tasks completed, others pending), re-run execute_analyze, and verify that only incomplete tasks are executed (i.e., invoke_claude is not called for already-completed tasks).

## Issues

- survey.exec.ts does not implement within-phase resume. Lines 70-72 unconditionally set phase.status='running' and execute all 9 steps from the beginning. update_task_status marks tasks completed but no code checks task.status before executing a step. The find_resumable_task function in stores/state.ts is available but never imported or called by survey.exec.ts. By contrast, extract.exec.ts correctly checks existing_task?.status === 'completed' at line 215. (src/engine/pipeline/survey.exec.ts)
  - **Required:** survey.exec.ts must check whether each task (file_index, manifest, tree, classify, domains, domain_review, extraction_plan, architecture, learnings) is already completed before executing it, so that re-running after a mid-survey crash resumes from the first incomplete task rather than re-running the entire survey.
- Integration tests verify resume across phase boundaries (completed phases are skipped) but do not test within-phase resume. No test simulates interruption mid-phase (e.g., setting some extraction tasks to 'completed' and others to 'pending') then re-invokes execute_analyze to verify only incomplete tasks run. (src/engine/pipeline/__tests__/analyze.exec.test.ts)
  - **Required:** An integration test must simulate partial completion within a phase (e.g., some extraction tasks completed, others pending), re-run execute_analyze, and verify that only incomplete tasks are executed (i.e., invoke_claude is not called for already-completed tasks).

## What Passed

- Criterion 1: npm test: 150 tests, 0 failures, 0 lint warnings. TypeScript compiles cleanly. markdownlint clean across 26 files.
- Criterion 2: analyze.exec.ts chains PHASE_SEQUENCE = ['survey', 'extract', 'reconcile', 'synthesize'] via execute_phase switch. Test at analyze.exec.test.ts:221 verifies all four phases reach 'completed' status.
- Criterion 3: analyze.exec.ts:59-62 checks config.skip_reconcile and continues past reconcile. Test at analyze.exec.test.ts:243 confirms reconcile phase is undefined in state when flag set.
- Criterion 4: commands/analyze.ts:31 parses --skip-deep-pass, maps to config.skip_deep_pass, forwarded to execute_extract via config. extract.exec.ts already supports this flag from Phase 2.
- Criterion 5: invoke.ts:151-160 checks effective_budget before each invocation, throws BudgetExceededError. analyze.exec.ts:76-84 catches it, logs spent/limit, saves state, returns. Test at analyze.exec.test.ts:302 verifies graceful halt.
- Criterion 6: invoke.ts:67-78 has SIGINT handler killing all active_processes. analyze.exec.ts:141-158 installs separate SIGINT handler saving state and calling process.exit(130). Both handlers fire on SIGINT — invoke.ts kills processes synchronously, then analyze handler saves state async.
- Criterion 7: analyze.exec.ts:66 calls is_phase_completed(state, phase_name) before each phase. Test at analyze.exec.test.ts:270 sets survey completed, verifies extract runs and completes.
- Criterion 9: commands/dry_run.ts:64 checks survey completion, runs survey if needed. Loads domains and plan, calls format_dry_run (reporter.ts:130-214) which outputs per-domain task count, batch count, tokens, estimated invocations, and projected cost with sonnet pricing.
- Criterion 10: commands/status.ts reads state and budget, calls format_status (reporter.ts:25-52) which now includes format_duration per phase and per task (reporter.ts:227-260), plus cost info via format_budget.
- Criterion 11: invoke.ts:267-274: setTimeout kills child process with SIGTERM after timeout ms. --timeout flag parsed in commands/analyze.ts:40, passed through config to invoke_claude.
- Criterion 12: commands/analyze.ts:33 parses --ridgeline, mapped to config.ridgeline_name. synthesize.exec.ts:221-223 calls copy_output_to_ridgeline when ridgeline_name is set.
- Criterion 13: README.md contains installation (lines 9-12), usage with examples for all 7 commands (lines 14-97), key flags table (lines 99-115), pipeline diagram (lines 117-131), architecture overview (lines 174-193), cost expectations (lines 143-154).
- Criterion 14: docs/architecture.md has mermaid pipeline flow diagram (line 12) and ASCII layers/data-flow/resume diagrams. docs/modules.md covers all src/ directories. docs/security.md covers API key handling, filesystem scope, subprocess management, budget enforcement. docs/howto.md covers analyzing, resuming, dry-run, inspecting artifacts, ridgeline output.
- Criterion 15: markdownlint-cli2 ran across 26 files with 0 errors (verified by npm test which includes lint:markdown).
- Criterion 16: analyze.exec.test.ts contains 7 tests with mocked Claude invocations verifying phase sequencing (resume skip, skip-reconcile), state transitions, budget enforcement, and output production.
