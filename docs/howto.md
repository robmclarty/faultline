# How-To Guide

## Analyze a Project End-to-End

The simplest way to use faultline is the `analyze` command, which runs all
four phases automatically:

```bash
npx faultline analyze ./path/to/project
```

This produces abstract product specs in `.faultline/output/`.

## Preview Cost Before Running

Use `dry-run` to see the extraction plan and estimated cost without invoking
Claude for extraction or synthesis:

```bash
npx faultline dry-run ./path/to/project
```

If survey has not been run, `dry-run` will run it first (this requires Claude
invocations for classification and domain mapping).

## Run Individual Phases

Each phase can be run independently:

```bash
npx faultline survey ./project      # Phase 1
npx faultline extract ./project     # Phase 2
npx faultline reconcile ./project   # Phase 2.5
npx faultline synthesize ./project  # Phase 3
```

Each phase checks that its prerequisites are completed and fails with a clear
message if not.

## Resume a Failed Run

Just re-run the same command. Faultline checks `state.json` and picks up from
the last completed task:

```bash
# First run — crashes mid-extraction
npx faultline analyze ./project
# ^C or error

# Second run — skips survey, resumes extraction from last completed task
npx faultline analyze ./project
```

Resume works at two levels:

- **Phase level**: Completed phases (survey, extract, etc.) are skipped entirely
- **Task level**: Within a phase, completed tasks (individual batch extractions,
  domain processing steps) are skipped

## Set a Budget Ceiling

To prevent runaway costs, set a maximum budget:

```bash
npx faultline analyze ./project --max-budget-usd 5.00
```

When the cumulative cost exceeds the ceiling, the pipeline halts gracefully,
saves state, and reports how much was spent. You can resume with a higher
budget:

```bash
npx faultline analyze ./project --max-budget-usd 10.00
```

## Handle Interruptions (Ctrl+C)

Pressing Ctrl+C during a run:

1. Kills all active Claude subprocesses
2. Saves current pipeline state to `state.json`
3. Exits cleanly with code 130

Re-running the same command resumes from where it stopped.

## Check Pipeline Status

```bash
npx faultline status ./path/to/project
```

Shows:

- Phase completion status with timing (e.g., "survey — completed (2m 30s)")
- Per-task status within each phase
- Error messages for failed tasks
- Cost summary with per-invocation breakdown

## Filter Files

Include only specific file types:

```bash
npx faultline survey ./project --include "*.ts" "*.tsx"
```

Exclude additional patterns:

```bash
npx faultline survey ./project --exclude "generated/**" "*.d.ts"
```

## Use a Different Model

```bash
npx faultline analyze ./project --model opus
npx faultline analyze ./project --survey-model haiku --model sonnet
```

## Adjust Timeout

```bash
npx faultline analyze ./project --timeout 600000  # 10 minutes per invocation
```

## Control Extraction Parallelism

```bash
npx faultline analyze ./project --concurrency 5   # 5 domains in parallel
```

## Skip Optional Steps

```bash
# Skip cross-domain reconciliation (faster, less thorough)
npx faultline analyze ./project --skip-reconcile

# Skip deep extraction pass for high-priority domains
npx faultline analyze ./project --skip-deep-pass
```

## Feed Output to Ridgeline

```bash
npx faultline analyze ./project --ridgeline my-build
```

This copies the final output to `.ridgeline/builds/my-build/` in addition to
`.faultline/output/`, ready for use with
[ridgeline](https://github.com/robmclarty/ridgeline).

## Inspect Intermediate Artifacts

All intermediate data is stored in `.faultline/`:

```bash
# Survey artifacts
cat .faultline/survey/file_index.json    # File inventory
cat .faultline/survey/domains.json       # Domain mapping
cat .faultline/survey/extraction_plan.json  # Batch plan
cat .faultline/survey/architecture.md    # Architecture description

# Extraction artifacts
cat .faultline/extractions/auth/batch-00.notes.md       # Batch notes
cat .faultline/extractions/auth/consolidated.notes.md   # Merged notes
cat .faultline/extractions/auth/review.json             # Review verdict

# Cross-references
cat .faultline/extractions/cross_references.json

# Learnings
cat .faultline/learnings.json          # Active set (bounded)
cat .faultline/learnings.log.json      # Full history

# Pipeline state
cat .faultline/state.json   # Phase/task completion status
cat .faultline/budget.json  # Cost tracking

# Final output
ls .faultline/output/specs/            # Domain specs
cat .faultline/output/architecture.md  # Refined architecture
cat .faultline/output/constraints.md   # Build constraints
cat .faultline/output/taste.md         # Code style
```

## Use Persistent Configuration

Create `.faultline/config.json` to set defaults that persist across runs:

```json
{
  "model": "sonnet",
  "timeout": 600000,
  "concurrency": 5,
  "max_retries": 2
}
```

CLI flags still override config.json values. The resolution order is:
defaults → config.json → CLI flags.

## Enable Verbose Output

```bash
npx faultline analyze ./project --verbose
```

Shows Claude stderr output and debug messages during execution. Useful for
debugging prompt issues or understanding what Claude is producing.
