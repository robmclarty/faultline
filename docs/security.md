# Security Considerations

## File Access

Faultline reads files from the target directory but never modifies them. All
output goes to `.faultline/` within the target directory. The tool has read
access to the entire target directory tree, filtered by include/exclude globs.

## Sensitive Files

The default exclude list filters out common sensitive file patterns:

- `.env` and `.env.*` files
- Lock files (which can leak dependency versions)
- Binary files (which could contain compiled secrets)

Users should review the file index (`survey/file_index.json`) after the survey
phase to verify no sensitive files were included. Use `--exclude` to add
additional patterns.

## Claude Invocations

All Claude interactions use `claude --print` which inherits the user's
existing authentication. No API keys are stored or managed by faultline.

Source code content is sent to Claude for analysis. Users should be aware that:

- File contents are sent to Anthropic's API
- The content may be subject to Anthropic's data policies
- Sensitive codebases should use appropriate API configurations

## Token Ceiling

The 5k token ceiling (~20k characters) on Claude-bound files prevents
accidentally sending large amounts of data in a single context. This is both
a quality measure (smaller contexts produce better analysis) and a safety
measure (limits data exposure per invocation).

## Process Management

Claude subprocesses are tracked in a process registry and cleaned up on SIGINT.
Timeout enforcement kills hung processes to prevent resource exhaustion. The
registry is a module-level `Set` that is cleared when all processes are killed.

When the `analyze` command receives SIGINT:

1. All active Claude subprocesses are sent SIGTERM
2. Pipeline state is saved to `state.json`
3. The process exits with code 130

This prevents orphaned subprocesses and ensures state is preserved for resumption.

## Budget Enforcement

The `--max-budget-usd` flag provides cost control. Budget is checked before
each Claude invocation by reading `budget.json` and comparing cumulative cost
against the ceiling. When exceeded, a `BudgetExceededError` is thrown, which
the pipeline catches to save state and exit gracefully.

Budget tracking is best-effort — it uses estimated costs based on published
pricing, not actual billing amounts. The estimates are intentionally
conservative (rounding up).

## Temporary Files

System prompts are written to temporary files (via `mkdtemp`) for passing to
`claude --print --system-prompt`. These files are cleaned up after each
invocation, even on failure. The cleanup is best-effort (`force: true`) to
avoid blocking on permission issues.

## Config File

The optional `.faultline/config.json` file is parsed with defensive handling:

- Missing files return empty config (no error)
- Malformed JSON returns empty config (no crash)
- Non-object values (arrays, strings) return empty config
- File system errors are silently ignored

This prevents config file corruption from breaking the pipeline.
