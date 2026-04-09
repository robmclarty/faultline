# How-To Guide

## Survey a Codebase

```bash
npx faultline survey ./path/to/project
```

This creates `.faultline/` in the target directory with:

- `survey/file_index.json` — Every file with size, token estimate, language,
  and category
- `survey/manifest.json` — Parsed dependency manifest (package.json, etc.)
- `survey/tree.txt` — Full directory tree listing
- `survey/domains.json` — Domain classifications with dependencies
- `survey/domain_review.json` — Adversarial review of domain quality
- `survey/extraction_plan.json` — Batched extraction tasks
- `survey/architecture.md` — Architecture description
- `learnings.json` — Active learnings set
- `learnings.log.json` — Full learnings log
- `state.json` — Pipeline state for resumability
- `budget.json` — Cost tracking per Claude invocation

## Filter Files

Include only specific file types:

```bash
npx faultline survey ./project --include "*.ts" "*.tsx"
```

Exclude additional patterns:

```bash
npx faultline survey ./project --exclude "generated/**" "*.d.ts"
```

## Check Status

```bash
npx faultline status ./path/to/project
```

Shows phase completion status and cost summary.

## Resume After Failure

Just rerun the same command. Faultline checks `state.json` and picks up from
the last completed step.

## Use a Different Model

```bash
npx faultline survey ./project --model opus
```

## Adjust Timeout

```bash
npx faultline survey ./project --timeout 600000  # 10 minutes
```

## Enable Verbose Output

```bash
npx faultline survey ./project --verbose
```

Shows Claude stderr output and debug messages during execution.
