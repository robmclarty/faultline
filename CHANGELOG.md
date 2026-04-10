# Changelog

## 0.5.10

- Fix spinner flickering from concurrent domain extractions with singleton spinner manager
- Serialize concurrent learnings writes with promise-based queue to prevent race conditions
- Eliminate learnings token ceiling errors by returning serialized string from compression
- Make learnings append failures non-fatal in extract and reconcile phases
- Improve file-coverage validation with multi-strategy matching (full path, dir/file, basename) and common-filename awareness
- Strip LLM conversational preamble from consolidated notes before first markdown heading
- Fix review-then-retry ordering so file-coverage validation runs after review feedback
- Relax review prompt to only fail on abstraction violations and implausible gap coverage
- Propagate API error messages instead of masking them as JSON parse failures
- Wrap top-level array schemas in object to satisfy Anthropic API requirement
- Enforce char ceiling in learnings compression secondary pass
- Read CLI version from package.json instead of hardcoded string

## 0.5.9

- Adopt ridgeline's claude spawn pattern: detached process groups, stall/startup timeout detection, and auth error surfacing
- Pass system prompt directly via `--system-prompt` flag instead of writing to temp files
- Export `kill_all_claude` and `kill_all_claude_sync` for reliable process cleanup
- Enable `--fail-on-issues` for fallow lint

## 0.5.8

- Switch from `--print` to `--output-format stream-json` for reliable structured output parsing
- Add `--json-schema` enforcement for all 6 JSON-expecting call sites (domains, reviews, classifications, reconciliation)
- Add NDJSON stream parser that prefers `StructuredOutput` tool_use blocks over prose in result field
- Use actual cost from stream-json instead of estimates in budget tracking

## 0.5.7

- Fix build to copy agent prompt files to dist, preventing ENOENT errors on global install

## 0.4.0

- Add analyze command with dry-run, status, and budget enforcement
- Add within-phase resume for survey and extract pipelines
- Comprehensive documentation for all commands and pipeline

## 0.3.0

- Implement reconciliation and synthesis pipelines
- Update architecture and module documentation for reconciliation and synthesis phases

## 0.2.0

- Implement complete extraction pipeline for codebase analysis
- Add Phase 2 extraction pipeline documentation and handoff notes

## 0.1.0

- Implement foundation and survey pipeline with CLI scaffolding
- Add config resolution with config.json middle tier
- Fix survey to use retried domains in subsequent pipeline steps
- Validate learnings ceiling in survey phase
