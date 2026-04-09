# Constraints

## Language & Runtime
- TypeScript on Node.js (match ridgeline's toolchain exactly)
- Target Node 22+
- ES modules (`"type": "module"` in package.json)

## Dependencies
- `commander` for CLI (same version as ridgeline: 13.x)
- No other runtime dependencies — keep the harness thin
- The harness shells out to `claude --print` for all model invocations (do not
  use the Anthropic SDK directly)

## Dev Dependencies
- `vitest` for tests
- `@vitest/coverage-v8` for coverage
- `oxlint` for code linting
- `agnix` for agent linting
- `fallow` for linting complexity scoring (a type of lint)
- `markdownlint-cli2` for linting markdown
- `typescript` 5.x
- `@types/node`

## Architecture Rules
- The harness is deterministic — all non-determinism lives inside the Claude
  invocations
- Prompts are markdown files loaded from `src/agents/` at runtime, never
  hardcoded strings in TypeScript
- Prompt templates use simple `{{variable}}` interpolation (implement in-house,
  no template library)
- All intermediate and output files are JSON or Markdown — no binary formats
- Every Claude invocation is logged to `budget.json` with model, input tokens,
  output tokens, and estimated cost
- State is persisted to `.faultline/state.json` after every task completion so
  the pipeline is resumable

## File Size Invariants
- No file written to `.faultline/` that will be loaded into a Claude context
  should exceed 5,000 tokens (~20,000 characters)
- `file_index.json` may be larger but is only read by the harness, never sent
  to Claude wholesale
- The harness must validate this constraint before writing any file intended for
  Claude consumption

## Claude CLI Integration
- All invocations use `claude --print --model <model> --system-prompt <file> --verbose`
- Input is piped via stdin
- Output is captured from stdout
- Timeout is enforced by the harness (kill the child process after `--timeout`)
- Retry with exponential backoff on transient failures (exit code != 0)
- Pass in sub-agents with `--agents` flag
- Pass in allowed tools with `--allowedTools` flag
- Look at `claude --help` to understand other configuration flags and use as appropriate

## Testing
- Use vitest for unit testing, call `npm test` (which includes linting) after 
  major code change and fix all errors + warnings
- Unit tests for all harness logic (batching, token estimation, state management,
  template interpolation, response parsing)
- Integration tests using fixture codebases in `test/fixtures/`
- No tests that require actual Claude CLI invocations (mock the subprocess layer)

## Documentation
- create a README.md in the root
- create relevant markdown format docs in the docs/ folder describing the major
  modules of defined in src/ explaining what they are and why they work the way
  they work
- when making diagrams, use either ascii or mermaid
- include docs for things like:
  - architecture
  - major modules
  - security
  - howto
  - anything that you feel is not immediately obvious

## Check Command
```
npm test
```
