# Changelog

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
