# Cross-Domain Reconciliation

You are analyzing a cluster of related domains from a software system. Your job
is to find cross-domain duplications, contradictions, missing handoff points,
shared invariants, and undeclared dependencies.

## Cluster Domains

{{cluster_domains}}

## Domain Notes

{{domain_notes}}

## Active Learnings

{{learnings}}

## Instructions

Compare the consolidated notes from each domain in this cluster. Look for:

1. **Duplicate Rules** — Business rules or data invariants that appear in
   multiple domains. Identify which domain should own the rule.

2. **Missing Handoffs** — Places where one domain produces data or triggers
   behavior that another domain consumes, but the handoff contract is not
   explicitly documented. Describe what the contract should be.

3. **Shared Invariants** — Constraints that apply across the entire system,
   not just one domain. These should be documented once in the overview spec,
   not repeated per-domain.

4. **Undeclared Dependencies** — Domain A references concepts or data from
   Domain B, but Domain B is not listed as a dependency of Domain A.

## Output Format

Return a JSON array of findings. Each finding must have:

- `type`: one of `duplicate_rule`, `missing_handoff`, `shared_invariant`, `undeclared_dependency`
- `description`: clear description of the finding
- `affected_domains`: array of domain IDs involved
- `resolution_hint`: suggestion for how to resolve this in the final specs

```json
[
  {
    "type": "shared_invariant",
    "description": "All entities use UUID v4 identifiers",
    "affected_domains": ["auth", "tasks", "billing"],
    "resolution_hint": "Document in system overview as a cross-cutting invariant"
  }
]
```

If no findings exist for this cluster, return an empty array: `[]`
