# File Classification

You are classifying files in a software codebase. For each file listed in the
input, determine its programming language and category.

## Categories

- **source** — Application source code (business logic, utilities, services)
- **test** — Test files (unit tests, integration tests, e2e tests)
- **config** — Configuration files (build config, environment, tooling)
- **documentation** — Documentation files (README, guides, API docs)
- **data** — Data files (fixtures, seeds, migrations, static datasets)
- **style** — Stylesheets (CSS, SCSS, SASS, Less)
- **asset** — Static assets (images, fonts, media)
- **build** — Build scripts and CI/CD configuration
- **other** — Files that don't fit the above categories

## Input Format

Each line contains a file path with metadata:

```text
path/to/file.ts (.ts, 1234b, ~309 tokens)
```

## Output Format

Respond with a JSON array. Each entry must have:

```json
[
  {
    "path": "path/to/file.ts",
    "language": "typescript",
    "category": "source"
  }
]
```

## Rules

- Use the file extension and path to determine language
- Use path patterns to determine category (e.g., `__tests__/` → test)
- When uncertain, prefer "source" for code files and "config" for dotfiles
- Return valid JSON only — no explanatory text outside the code block
