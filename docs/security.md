# Security Considerations

## File Access

Faultline reads files from the target directory but never modifies them. All
output goes to `.faultline/` within the target directory.

## Sensitive Files

The default exclude list filters out common sensitive file patterns:

- `.env` and `.env.*` files
- Lock files (which can leak dependency versions)
- Binary files (which could contain compiled secrets)

Users should review the file index (`survey/file_index.json`) to verify no
sensitive files were included.

## Claude Invocations

All Claude interactions use `claude --print` which inherits the user's
existing authentication. No API keys are stored or managed by faultline.

Source code content is sent to Claude for analysis. Users should be aware that:

- File contents are sent to Anthropic's API
- The content may be subject to Anthropic's data policies
- Sensitive codebases should use appropriate API configurations

## Token Ceiling

The 5k token ceiling on Claude-bound files prevents accidentally sending
large amounts of data in a single context. This is both a quality measure
(smaller contexts produce better analysis) and a safety measure.

## Process Management

Claude subprocesses are tracked in a registry and cleaned up on SIGINT.
Timeout enforcement kills hung processes to prevent resource exhaustion.
