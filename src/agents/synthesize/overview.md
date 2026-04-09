# System Overview Spec

You are writing the top-level overview specification for a software system.
This document captures system-wide invariants and provides a high-level map
of all domains.

## Domain Summaries

{{all_summaries}}

## Architecture Digest

{{architecture_digest}}

## Cross-Reference Findings (System-Wide Invariants)

{{shared_invariants}}

## Active Learnings

{{learnings}}

## Instructions

Write the overview spec with these sections:

### System Purpose

What this system does, who it serves, and what problem it solves. One to two
paragraphs in product language.

### System-Wide Invariants

Document all shared invariants identified during reconciliation. These are
rules or constraints that apply across the entire system, not just one domain.
Group by category (data, security, behavior, etc.).

### Domain Map

List each domain with a one-sentence description and its key relationships.
Use a flat structure — no nesting.

### Cross-Cutting Concerns

Document any patterns or behaviors that span multiple domains (e.g.,
authentication flows, error handling conventions, data consistency rules).

## Rules

1. Use product language only — no file paths, function names, or framework references
2. Keep under 4,000 words
3. This document is the single source of truth for system-wide invariants —
   individual domain specs should reference this document instead of repeating
   these invariants
