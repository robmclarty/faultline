# Taste

## Code Style
- Prefer async/await over raw promises or callbacks
- Use arrow functions for inline callbacks, named function declarations for exports
- Destructure imports and function parameters
- Prefer `const` over `let`; never use `var`
- Use early returns to reduce nesting depth
- Keep functions under ~50 lines; extract helpers when approaching that limit

## Naming
- `snake_case` for variables, functions, parameters, and module names
- `PascalCase` for types, interfaces, and any class-like constructs
- `SCREAMING_SNAKE_CASE` for true compile-time constants (e.g., default config values) and enum members
- File names and directory names use `snake_case`
- Name files after what they export: `token.estimator.ts` exports `estimate_tokens`

## Module Structure
- Export functions where they are defined (e.g., `export const my_func () => {}`)
- Split file modules up into sections: 
	0. Imports (unnamed: don't use a divider for imports)
	1. Constants (local config)
	2. Types (export public contracts)
	3. Helpers (only used in this file)
	4. API (exported functions)
- Use visual divisions for each section above like this where the name is right-aligned with 2 ending `//` slashes with the last slash at the 100 character mark (exclude imports section):
	```
	///////////////////////////////////////////////////////////////// Constants //
	```
- Group imports: node builtins first, then external deps, then local modules
- Keep module interfaces narrow — prefer a few well-named functions over a class with many methods
- Avoid classes unless there's genuine shared mutable state; prefer plain functions + data objects
- Each top-level folder (`commands/`, `engine/`, `stores/`, `ui/`) has a barrel
  `index.ts` that re-exports its public API
- Prefer `type` over `interface` for better composition and smaller bundle size

## Error Handling
- Use typed error classes that extend Error (e.g., `class SurveyError extends Error`)
- Catch at the boundary (CLI command handler), not deep inside library code
- Let unexpected errors propagate — don't swallow them with empty catches
- Log errors with enough context to resume (which task, which domain, which file)

## File Organization
```
src/
├── cli.ts                      # Entry point, commander setup
├── commands/                   # One file per CLI command (thin: parse args, delegate)
│   ├── index.ts
│   ├── analyze.ts
│   ├── survey.ts
│   ├── extract.ts
│   ├── synthesize.ts
│   ├── dry_run.ts
│   └── status.ts
├── engine/                     # Orchestration + analysis logic
│   ├── index.ts
│   ├── claude/                 # Claude CLI integration
│   │   ├── invoke.ts           # Spawn `claude --print`, timeout, retry, process registry
│   │   ├── prompt_loader.ts    # Load .md templates from agents/, interpolate {{vars}}
│   │   └── response_parser.ts  # Extract JSON/markdown blocks from stdout
│   ├── pipeline/               # Phase orchestration
│   │   ├── survey.exec.ts      # Survey phase sequencing (index → classify → domains → plan → arch)
│   │   ├── extract.exec.ts     # Extraction loop, consolidation, validation, parallel dispatch
│   │   └── synthesize.exec.ts  # Synthesis sequencing (summaries → specs → overview → arch → constraints → taste)
│   ├── file_walker.ts          # Recursive traversal, include/exclude glob matching
│   ├── token_estimator.ts      # bytes → estimated tokens by file type
│   └── batcher.ts              # Pack items into token-budgeted batches
├── stores/                     # All disk persistence (read/write JSON and markdown to .faultline/)
│   ├── index.ts
│   ├── state.ts                # Read/write state.json, phase/task status, resume detection
│   ├── budget.ts               # Per-invocation cost logging to budget.json
│   ├── config.ts               # Resolve CLI flags → config.json → defaults
│   ├── survey.ts               # Read/write survey artifacts (file_index, domains, extraction_plan, manifest)
│   ├── extractions.ts          # Read/write batch notes, consolidated notes per domain
│   └── output.ts               # Write final deliverables, optional ridgeline directory copy
├── ui/                         # Terminal presentation (no business logic)
│   ├── index.ts
│   ├── spinner.ts              # Progress indicator during Claude invocations
│   ├── reporter.ts             # Status/dry-run table formatting, cost summaries
│   └── log.ts                  # Structured logging helpers
├── agents/                     # Prompt templates (markdown files, loaded at runtime)
│   ├── survey/
│   │   ├── classify.md
│   │   ├── domains.md
│   │   └── architecture.md
│   ├── extract/
│   │   ├── system.md
│   │   ├── consolidate.md
│   │   └── validate_feedback.md
│   ├── synthesize/
│   │   ├── summarize.md
│   │   ├── spec.md
│   │   ├── overview.md
│   │   ├── architecture.md
│   │   ├── constraints.md
│   │   └── taste.md
│   └── shared/
│       ├── abstraction_rules.md
│       └── ridgeline_format.md
└── types.ts                    # Shared type definitions
```

### Layer responsibilities

**`commands/`** — Thin shells. Parse CLI args, call into `engine/pipeline/`,
report results via `ui/`. No direct file I/O or Claude interaction.

**`engine/`** — All orchestration and analysis logic. Decides *what* to do and
in what order. Calls `engine/claude/` for model invocations and `stores/` for
persistence. Never writes to disk directly.

**`stores/`** — Owns every file under `.faultline/`. Each module manages a
specific artifact or group of artifacts. Pure data I/O: read JSON, write JSON,
validate size constraints. No orchestration logic.

**`ui/`** — Terminal output only. Spinners, progress bars, formatted tables,
log levels. Imported by `commands/` and `engine/pipeline/`, never by `stores/`.

**`engine/claude/`** — Subprocess management for `claude --print`. Maintains a
process registry for graceful SIGINT cleanup when running concurrent extractions.
Handles timeout, retry with backoff, and cost capture from stderr/stdout.

## Documentation
- JSDoc on exported functions (brief — one line of description + `@param` / `@returns`)
- No JSDoc on internal/helper functions unless the logic is non-obvious (but still include a description of the why and what)
- All function comments/docs should use this format:
  ```
  /**
   * My Function Name
   *
   * This is where my description goes.
   *
   * @param x - does X things.
   */
   
   or
   
   /**
    * A description of a helper function explaining what is does and why.
    */

   but never:

   /** A description on one line. */
  ```
- README covers installation, usage, and architecture

## Testing
- Tests should be co-located next to the files they test (for unit tests) in `__tests__` folders for every folder
- Cross-file tests (integration and e2e) should go in a root level `test/` folder which contains other sub-folders for overall test-suite concerns (e.g., setup, db spin up and tear down, fixtures, etc.)
- Always run the test command with linting after every significant code change and fix all errors and warnings

## Formatting
- 2-space indentation
- No semicolons (rely on ASI with the standard safe rules)
- Single quotes for strings
- No trailing commas
- Max line length ~100 characters (soft limit, don't break readability to enforce)

## Design Philosophy
- Optimize for the happy path while staying flexible
- Keep the harness thin — state, context boundaries, quality gates
- The model handles everything else
- Don't assume future needs, but don't close doors either
- When in doubt, write a function not a class
