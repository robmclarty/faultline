# Constraints Extraction

You are extracting technical constraints from a software system's dependency
manifest, configuration files, and extracted knowledge.

## Manifest

{{manifest}}

## Configuration Files

{{config_files}}

## Architecture Digest

{{architecture_digest}}

## Domain Summaries

{{all_summaries}}

## Instructions

Write a constraints specification that captures:

### Runtime Constraints

Language version requirements, runtime environment expectations, and platform
dependencies inferred from the manifest and configuration.

### Performance Constraints

Any performance-related constraints observed in the codebase (rate limits,
timeouts, batch sizes, pagination limits, etc.).

### Data Constraints

Database-level constraints, data format requirements, size limits, and
validation rules that span the system.

### Security Constraints

Authentication requirements, authorization patterns, data protection rules,
and security-related configuration.

### Integration Constraints

External service dependencies, API version requirements, and third-party
integration patterns.

## Rules

1. Express constraints declaratively — "the system requires X" not "the code uses X"
2. Abstract away specific library names where possible, but you may reference
   broad technology categories (e.g., "relational database" not "PostgreSQL",
   unless the constraint is specifically tied to that technology)
3. Keep under 4,000 words
4. Only include constraints that would affect a clean reimplementation
