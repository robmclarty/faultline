# Phase 4: Integration, Resume Logic & Documentation

## Goal

Wire all pipeline phases into the end-to-end `faultline analyze` command, implement robust resume logic so interrupted runs pick up from the last completed task, deliver the `dry-run` and `status` commands, handle graceful interruption and budget enforcement, and produce comprehensive project documentation. This phase transforms four independently-tested pipeline stages into a cohesive, production-quality tool.

By the end of this phase, `faultline analyze ./some-project` runs the complete pipeline from survey through synthesis, handles crashes and interruptions gracefully, respects cost ceilings, and can resume from any failure point. The project has thorough documentation covering architecture, usage, security, and non-obvious design decisions.

## Context

Phases 1-3 delivered all four pipeline stages as independently working commands: `faultline survey` (Phase 1), `faultline extract` (Phase 2), `faultline reconcile` and `faultline synthesize` (Phase 3). Each command reads its predecessor's artifacts from `.faultline/` and writes its own artifacts there. State tracking (`state.json`) records per-step and per-task completion. Budget tracking (`budget.json`) logs every Claude invocation. The learnings system carries cross-domain insights across phase boundaries.

What remains is integration: the `analyze` command that chains all phases with proper state transitions, skip-flag support, and cost ceiling enforcement; the `dry-run` command that shows the extraction plan and cost estimate without invoking Claude; the `status` command that pretty-prints pipeline progress; graceful SIGINT handling that kills all live Claude subprocesses and saves state; and documentation.

The process registry in `engine/claude/invoke.ts` already tracks all spawned Claude subprocesses — the SIGINT handler needs to call its kill-all function and then persist state before exiting.

## Acceptance Criteria

1. `npm test` passes with zero failures and zero lint warnings
2. `npx faultline analyze ./test/fixtures/sample-app` executes all four phases in sequence (survey → extract → reconcile → synthesize) and produces the complete `.faultline/output/` directory
3. `npx faultline analyze` with `--skip-reconcile` goes directly from extract to synthesize, skipping Phase 2.5
4. `npx faultline analyze` with `--skip-deep-pass` skips deep extraction passes for high-priority domains
5. `npx faultline analyze` with `--max-budget-usd <n>` halts the pipeline gracefully when cumulative cost exceeds the threshold, saves state, and reports how much was spent and which phase was interrupted
6. Interrupting a run with SIGINT kills all live Claude subprocesses, saves current state to `state.json`, and exits cleanly — re-running the same command resumes from the last completed task rather than restarting
7. Resume works across phase boundaries: after interrupting mid-extraction, re-running `faultline analyze` skips the completed survey phase and completed extraction tasks, continuing from the first incomplete task
8. Resume works within phases: after interrupting mid-survey (e.g., classification completed but domain mapping crashed), re-running `faultline survey` continues from domain mapping
9. `npx faultline dry-run ./test/fixtures/sample-app` (after survey, or triggering survey first) prints the extraction plan with per-domain task count, batch count, estimated token usage, estimated Claude invocations, and projected total cost — without invoking Claude for extraction or synthesis
10. `npx faultline status ./test/fixtures/sample-app` displays a formatted summary of pipeline state including completed, in-progress, and pending phases/tasks, with timing and cost information
11. The `--timeout` flag is enforced per Claude invocation (kills the child process after the deadline)
12. The `--ridgeline <name>` flag causes `analyze` to copy final output to `.ridgeline/builds/<name>/` in addition to `.faultline/output/`
13. A `README.md` exists in the project root covering installation, usage with examples for all commands and key flags, architecture overview, and cost expectations
14. Documentation exists in `docs/` covering: architecture overview (with mermaid or ASCII diagrams showing the pipeline flow and module dependencies), major modules guide (what each `src/` directory does and why), security considerations (API key handling, filesystem access scope, subprocess management), and a how-to guide (analyzing a project, resuming a failed run, inspecting intermediate artifacts, feeding output to ridgeline)
15. All documentation files pass markdownlint without errors
16. Integration tests exist that exercise the full analyze pipeline end-to-end with mocked Claude invocations, verifying correct phase sequencing, state transitions, and output production
17. Integration tests verify resume behavior: simulate interruption, verify re-run skips completed work

## Spec Reference

The `analyze` command chains survey → extract → reconcile → synthesize with state transitions persisted after every task. The CLI supports flags for `--skip-reconcile`, `--skip-deep-pass`, `--max-budget-usd`, `--timeout`, `--concurrency`, `--max-retries`, `--ridgeline <name>`, `--include`/`--exclude` globs, `--context-budget`, `--model`, `--survey-model`, and `--output`. The `dry-run` command shows the extraction plan and estimated cost. The `status` command shows pipeline progress.

Pipeline state is persisted to `.faultline/state.json` after every task completion so the pipeline is resumable from any failure point. Graceful interruption requires killing all live Claude subprocesses (tracked by the process registry) before saving state and exiting. The `--max-budget-usd` ceiling requires checking cumulative cost from `budget.json` before each Claude invocation and halting if the next invocation would exceed the budget.

Documentation requirements: README with installation and usage, docs/ folder with architecture (including pipeline diagrams), major modules, security considerations, and how-to guides. All documentation uses markdown format with mermaid or ASCII for diagrams.
