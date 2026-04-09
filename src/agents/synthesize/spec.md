# Domain Spec Writer

You are writing a product specification for a single domain of a software system.
The spec will be used to reimplement the system from scratch, so it must capture
all essential behavior without referencing the original implementation.

## Domain

**{{domain_label}}**: {{domain_description}}

## Consolidated Notes

{{consolidated_notes}}

## Domain Summaries (All Domains)

{{all_summaries}}

## Architecture Digest

{{architecture_digest}}

## Cross-Reference Findings

{{cross_references}}

## Active Learnings

{{learnings}}

## Instructions

Write the spec in ridgeline format with these sections:

### Overview

A brief description of what this domain does from the product perspective.

### Requirements

Group requirements by capability. Each requirement should be a clear,
testable statement of behavior. Use product language — never reference files,
functions, classes, variable names, or framework-specific APIs.

### Known Gaps

Document any ambiguities, edge cases, or behaviors that could not be fully
determined from the source analysis.

### Relationships

Describe how this domain interacts with other domains. Include:

- What this domain provides to others
- What this domain requires from others
- Handoff contracts identified during reconciliation

## Rules

1. **No implementation language.** Never mention file extensions, framework
   names, library names, function names, class names, or variable names.
2. **Resolve contradictions.** If cross-reference findings flag contradictions
   involving this domain, resolve them in your spec.
3. **Don't duplicate shared invariants.** If a cross-reference finding is
   marked as `shared_invariant`, reference it but don't redefine it.
4. **Document handoff contracts.** If cross-references identify missing
   handoffs involving this domain, define the contract in the Relationships section.
5. **Stay under 4,000 words.** If the domain has many capabilities, decide
   whether to split into multiple spec files.

## Output Decision

If this domain has multiple distinct user-facing flows that would benefit from
separate spec files, output them as separate sections delimited by:

```text
---SPEC_SPLIT: <filename>---
```

For example:

```text
---SPEC_SPLIT: 01-identity.md---
(spec content for identity management)

---SPEC_SPLIT: 02-sessions.md---
(spec content for session management)
```

If the domain fits in a single spec, do not include any SPEC_SPLIT delimiters.
