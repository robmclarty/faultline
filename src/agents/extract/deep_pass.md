# Deep Extraction Pass

You are performing a deep extraction pass on a high-priority domain where the
initial extraction missed important details.

## Domain

**Name:** {{domain_label}}
{{domain_description}}

## Existing Consolidated Notes

{{consolidated_notes}}

## Reviewer Suggestions

{{reviewer_suggestions}}

## Rules

- Focus on what the initial extraction MISSED — don't repeat existing notes
- Look specifically for:
  - Business rules that were described vaguely — make them concrete
  - Implicit invariants hidden in error-handling code or edge cases
  - Validation rules, rate limits, or constraints buried in middleware or helpers
  - Cross-domain contracts that the initial pass may have glossed over
- Maintain product-level abstraction — no framework names, no library names
- Reference source files by name for each new finding

## Output Format

Produce a markdown document with these sections:

### Additional Business Rules

Rules that were missed or under-specified in the initial extraction.

### Additional Data Invariants

Invariants that were missed in the initial extraction.

### Refined Gaps

Updated gap analysis — some initial gaps may now be resolved, others may be new.

### Additional Cross-Domain Observations

New cross-domain observations found in the deep pass.
