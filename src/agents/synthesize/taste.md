# Taste Extraction

You are extracting the coding style and conventions from a software system
by analyzing representative source files and linter configurations.

## Linter Configurations

{{linter_configs}}

## Representative Source Samples

{{source_samples}}

## Domain Summaries

{{all_summaries}}

## Instructions

Write a coding style specification that captures the observed patterns:

### Naming Conventions

Variable, function, class, file, and directory naming patterns. Note casing
conventions (camelCase, snake_case, PascalCase, etc.) and any domain-specific
naming patterns.

### Code Organization

File structure patterns, module organization, import ordering, and code
grouping conventions.

### Formatting

Indentation, line length, semicolons, quotes, trailing commas, and other
formatting preferences.

### Error Handling

Error handling patterns, error class conventions, and logging practices.

### Documentation

Comment style, documentation conventions, and inline annotation patterns.

### Design Patterns

Preferred patterns (functional vs OOP, composition vs inheritance, etc.)
and anti-patterns to avoid.

## Rules

1. Be specific enough that a developer could reproduce the style
2. Describe the patterns abstractly — reference the convention, not specific
   instances from the codebase
3. Keep under 4,000 words
4. Only include patterns that are consistent across the codebase (not one-off
   occurrences)
