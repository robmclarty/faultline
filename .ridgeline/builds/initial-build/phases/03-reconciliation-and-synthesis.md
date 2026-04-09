# Phase 3: Reconciliation & Synthesis

## Goal

Implement cross-domain reconciliation (Phase 2.5) and the complete synthesis pipeline (Phase 3) that transforms intermediate artifacts into the final deliverable output. These are combined because reconciliation exists specifically to improve synthesis quality — its output directly shapes how specs are written, where shared invariants are placed, and how contradictions are resolved.

By the end of this phase, running `faultline reconcile` followed by `faultline synthesize` (or just `faultline synthesize` with `--skip-reconcile`) produces the complete `.faultline/output/` directory: domain-organized spec files in ridgeline format, a system overview, refined architecture documentation, inferred constraints, and inferred coding style — all ready for use as ridgeline input for clean reimplementation.

## Context

Phase 1 delivered the project foundation and working survey pipeline. Phase 2 delivered the complete extraction pipeline. The following artifacts are now available:

- `.faultline/survey/domains.json` — domain structure with priorities, dependencies, sub-domains
- `.faultline/survey/extraction_plan.json` — the task breakdown used during extraction
- `.faultline/survey/architecture.md` — current system architecture description
- `.faultline/survey/manifest.json` — parsed dependency manifests
- `.faultline/extractions/<domain>/consolidated.notes.md` — reviewed, consolidated observation notes per domain (each ≤5k tokens)
- `.faultline/extractions/<domain>/review.json` — extraction reviewer verdicts
- `.faultline/learnings.json` — active learnings set (≤3k tokens) with cross-domain insights from architecture analysis and extraction
- `.faultline/learnings.log.json` — full append-only learnings log
- `.faultline/state.json` — pipeline state tracking survey and extraction completion
- `.faultline/budget.json` — cumulative cost tracking

The Claude invocation layer, prompt template system, state persistence, budget tracking, learnings management, and all utility modules are available and tested. Config files and linter configs from the target codebase were captured during survey.

## Acceptance Criteria

1. `npm test` passes with zero failures and zero lint warnings
2. All reconciliation and synthesis prompt templates exist as markdown files: `src/agents/reconcile/system.md`, `src/agents/synthesize/summarize.md`, `spec.md`, `overview.md`, `architecture.md`, `constraints.md`, `taste.md`
3. `npx faultline reconcile ./test/fixtures/sample-app` (after extract) produces `.faultline/extractions/cross_references.json` with findings organized by cluster
4. Cluster identification builds the domain interaction graph from `domains.json` dependency edges plus grep-based reference detection in consolidated notes, and splits connected components exceeding 5 domains by removing weakest edges
5. Each finding in `cross_references.json` has a type (`duplicate_rule`, `missing_handoff`, `shared_invariant`, or `undeclared_dependency`), description, affected domains list, and resolution_hint
6. Reconciliation findings (contradictions, shared invariants) are appended to both `learnings.json` and `learnings.log.json`
7. Isolated domains with no cross-domain edges are skipped during reconciliation
8. `npx faultline synthesize ./test/fixtures/sample-app` (after reconcile) produces `.faultline/synthesis/domain_summaries.json` with one summary per domain, each approximately 500 tokens
9. `npx faultline synthesize` produces domain spec files organized in subdirectories under `.faultline/output/specs/` with numbered prefixes (e.g., `auth/01-identity.md`, `auth/02-sessions.md`)
10. The spec writer decides whether each domain warrants single or multiple spec files based on distinct user-facing flows and word count thresholds
11. Every domain in `domains.json` maps to at least one spec file in the output
12. No single output spec file exceeds approximately 4,000 words (~5,000 tokens)
13. Each spec follows ridgeline format: Overview, Requirements (grouped by capability), Known Gaps, and Relationships sections — using product language only
14. Per-domain spec writing receives cross-reference findings mentioning that domain and resolves contradictions, documents handoff contracts in the Relationships section, and avoids duplicating rules flagged as system-wide invariants
15. `npx faultline synthesize` produces `.faultline/output/specs/00-overview.md` documenting system-wide invariants identified by reconciliation rather than repeating them in individual domain specs
16. The harness-level abstraction enforcement scan detects: file extensions (`.ts`, `.js`, `.py`, etc.), framework names from `manifest.json`, camelCase/snake_case identifiers over 15 characters, and path-like strings (`src/`, `lib/`, `./`) in spec files
17. Spec files flagged by the abstraction scan are resubmitted to the spec writer once with violation feedback; remaining violations after retry are logged as warnings
18. `npx faultline synthesize` produces `.faultline/output/architecture.md` (refined from survey architecture with extraction insights), `.faultline/output/constraints.md`, and `.faultline/output/taste.md`
19. The `--skip-reconcile` flag allows synthesize to run directly after extract, with synthesis proceeding without cross-reference data
20. When `--ridgeline <name>` is specified, output is also copied to `.ridgeline/builds/<name>/`
21. `.faultline/state.json` is updated after each synthesis step completes
22. Unit tests exist with mocked Claude invocations covering: cluster identification from domain interaction graphs (including oversized component splitting), reconciliation report merging, domain summary compression, spec writing with cross-reference integration, abstraction enforcement scan (detection and rewrite triggering), and output assembly

## Spec Reference

Reconciliation (Phase 2.5) detects cross-domain duplications, contradictions, and missing handoff points. The harness builds a domain interaction graph from declared dependencies and observed references in consolidated notes, identifies clusters of ≤5 related domains, and runs per-cluster Claude invocations. Each cluster reconciliation receives all constituent domains' consolidated notes plus relevant learnings. Findings are typed: `duplicate_rule`, `missing_handoff`, `shared_invariant`, `undeclared_dependency`.

Synthesis (Phase 3) has seven steps: (3a) domain summary compression to ~500 tokens each, batched; (3b) per-domain spec writing receiving cross-references, learnings, all domain summaries, and architecture digest — Claude decides single vs multi-file output; (3b') harness-level abstraction enforcement scanning for implementation language with conditional rewrite; (3c) overview spec documenting system-wide invariants from reconciliation; (3d) architecture refinement; (3e) constraints extraction from manifests and configs; (3f) taste extraction from representative source files and linter configs.

Output structure: `specs/` organized by domain classification (max 2 levels deep), numbered prefixes within each folder, `00-overview.md` at the top level. No output file exceeds ~4,000 words. Specs use ridgeline format (Overview, Requirements, Known Gaps, Relationships) with no file paths, function names, class names, variable names, or framework-specific APIs.
