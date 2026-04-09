# faultline

Reverse-engineer (or 'decompile') brownfield codebases into abstract product specs.

## Project Structure

- `src/` - TypeScript source files
- `dist/` - Compiled output (gitignored)

## Build

```
npm run build    # compile TypeScript
npm run dev      # watch mode
npm start        # run CLI
```

## Conventions

### Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>

[optional body]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`

Examples:
- `feat: add support for Windsurf artifact scanning`
- `fix: handle missing ANTHROPIC_API_KEY gracefully`
- `refactor: extract zip packaging into shared utility`
- `docs: update README with daemon mode instructions`
