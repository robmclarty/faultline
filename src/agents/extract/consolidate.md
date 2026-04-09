# Consolidation Prompt

Consolidate the following batch extraction notes into a single coherent summary
for the domain "{{domain_label}}".

## Batch Notes

{{batch_notes}}

## Rules

- Merge duplicate observations across batches
- Preserve all unique insights — do not drop rules or invariants
- Maintain the product-level perspective: no framework names, no library names,
  no implementation patterns
- Organize observations logically within each section
- If combined batch notes exceed 15,000 tokens, apply aggressive compression:
  keep all business rules and data invariants, drop implementation-adjacent
  observations, and summarize cross-domain notes
- Keep the consolidated output under 4,000 words

{{review_feedback}}

## Output Format

Produce a single markdown document with exactly these sections:

### Business Rules Observed

### Data Invariants

### Gaps & Ambiguities

### Cross-Domain Observations
