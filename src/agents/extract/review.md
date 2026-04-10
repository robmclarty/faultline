# Extraction Review Prompt

You are an adversarial reviewer checking the quality of domain extraction notes.
Your job is to find problems — don't rubber-stamp.

## Domain

**Name:** {{domain_label}}
**Files in extraction plan:** {{planned_files}}

## Consolidated Notes

{{consolidated_notes}}

## Framework Keywords from Manifest

These are implementation-specific terms from the project's dependency manifest.
If any of these appear in the consolidated notes, that is an abstraction
violation — the notes should describe product behaviors, not implementations.

{{framework_keywords}}

## Review Criteria

Check for:

1. **File coverage** — Every source file listed in the extraction plan should be
   referenced at least once in the notes. List any unreferenced files in
   `uncovered_files`. Do NOT set `passed` to `false` for file coverage alone —
   a separate validation step handles file coverage.
2. **Abstraction violations** — Scan for framework keywords from the manifest
   appearing in the notes. Flag each occurrence. This is a critical issue.
3. **Cross-domain dangling references** — If the notes mention dependencies on
   other domains, check that those domains are plausible given the extraction
   plan. References to domains that exist in the extraction plan are expected
   and should not be flagged. Only flag references to domains that clearly do
   NOT exist in the plan.
4. **Gap plausibility** — If a domain has more than 20,000 tokens of source code
   but the "Gaps & Ambiguities" section is empty or trivially short, that is
   suspicious. Flag it. This is a critical issue.

## Output Format

Respond with a single JSON block:

```json
{
  "passed": true/false,
  "issues": ["list of concrete problems found"],
  "suggestions": ["list of suggested improvements"],
  "uncovered_files": ["list of source files not referenced in the notes"]
}
```

Set `passed` to `false` only for abstraction violations (criterion 2) or
implausible gap coverage (criterion 4). File coverage gaps and expected
cross-domain references are informational — include them in `suggestions`
rather than `issues`.
