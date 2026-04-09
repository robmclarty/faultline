# Faultline

Reverse-engineer (or "decompile") brownfield codebases into abstract product specs.

Faultline reads an existing codebase and produces a set of organized PRDs
(product requirements documents) that describe *what the application does* at a
business-rule level -- independent of its current implementation. The output is
compatible with ridgeline as spec input for clean reimplementation.

---

## Output Structure

```
.faultline/
├── config.json                    # Run configuration + thresholds
├── state.json                     # Pipeline progress, resumable
├── budget.json                    # Per-invocation cost tracking
├── learnings.log.json             # Full append-only learnings log (not sent to Claude)
├── learnings.json                 # Active set: bounded, curated view (sent to Claude)
│
├── survey/                        # Phase 1 artifacts (intermediate, preserved)
│   ├── tree.txt                   # Full recursive file listing
│   ├── manifest.json              # Parsed dependency manifests
│   ├── file_index.json            # Every file: path, size, language, token est.
│   ├── domains.json               # Domain classifications + file assignments
│   ├── domain_review.json         # Domain reviewer verdict
│   ├── extraction_plan.json       # Batched extraction tasks w/ token budgets
│   └── architecture.md            # Current architecture description
│
├── extractions/                   # Phase 2 + 2.5 artifacts (intermediate, preserved)
│   ├── auth/
│   │   ├── batch-01.notes.md      # Notes from first extraction pass
│   │   ├── batch-02.notes.md      # Notes from second pass (if domain was split)
│   │   ├── consolidated.notes.md  # Merged notes for this domain
│   │   ├── review.json            # Extraction reviewer verdict
│   │   └── deep_pass.notes.md     # Second-pass notes (high-priority domains only)
│   ├── permissions/
│   │   └── ...
│   ├── _cross-cutting/
│   │   └── consolidated.notes.md
│   └── cross_references.json      # Cross-domain reconciliation report
│
├── synthesis/                     # Phase 3 working files (intermediate)
│   └── domain_summaries.json      # Compressed summaries of all domains
│
└── output/                        # Final deliverables
    ├── architecture.md            # Current architecture (reference, not prescriptive)
    ├── constraints.md             # Inferred tech constraints
    ├── taste.md                   # Inferred coding style
    ├── specs/
    │   ├── 00-overview.md         # System-level product summary
    │   ├── auth/
    │   │   ├── 01-identity.md     # "User Identity & Accounts"
    │   │   └── 02-sessions.md     # "Session & Token Management"
    │   ├── commerce/
    │   │   ├── 01-catalog.md
    │   │   ├── 02-cart.md
    │   │   └── 03-checkout.md
    │   └── ...
    └── shapes/                    # Optional lower-level patterns
        ├── data_model.md
        ├── api_surface.md
        └── event_flows.md
```

### Output sizing rules

No single output file should exceed ~4,000 words (~5k tokens). This ensures any
file can be loaded into a context window alongside other material without
dominating it. If a domain's spec would exceed this, split it into sub-files
within its domain folder.

Spec sub-folders are organized by domain classification (max 2 levels deep from
`specs/`). A flat numbering prefix (`01-`, `02-`, ...) within each folder
controls reading order.

---

## The Scaling Problem

A company codebase with tens of thousands of files cannot fit in a single
context window at any phase. The pipeline must:

1. **Never assume the full codebase fits in context.** Not at survey, not at
   extraction, not at synthesis.
2. **Produce intermediate artifacts that are bounded in size.** Each domain's
   consolidated notes must fit in a context window. If they don't, compress
   further before synthesis.
3. **Track token budgets explicitly.** Every intermediate file has an estimated
   token count. The harness plans batches against a known context ceiling.
4. **Prefer fresh context windows over compaction.** Compaction loses signal
   unpredictably. Phased execution with explicit handoff context (like
   ridgeline) is more reliable, even at the cost of some cross-batch coherence.

### Token budget model

```
Context ceiling:  ~180,000 tokens (opus, leaving room for system prompt + output)
System prompt:     ~3,000 tokens (per phase)
Output reserve:   ~20,000 tokens (max expected output per invocation)
Available input:  ~157,000 tokens
Safety margin:     ~7,000 tokens
Working budget:   150,000 tokens per invocation
```

These are configurable via `config.json`. The harness never guesses -- it
measures file sizes, estimates tokens (≈4 chars/token for code), and plans
batches before invoking Claude.

### Accumulated learnings

The pipeline produces insights at every step that are relevant to later steps
but would otherwise be lost at context boundaries. Learnings are the connective
tissue of the pipeline -- the accumulated wisdom about how the codebase actually
works across domain boundaries. They are among the most important artifacts
faultline produces, because they carry the cross-cutting understanding that no
single extraction pass can see on its own.

Managing cross-phase knowledge is a hard problem. Compression improves quality
(forcing the model to distill an observation into its essence often produces a
*better* insight than the verbose original), but compression is lossy in
unpredictable ways. The compressor can't know what will matter to a downstream
consumer that hasn't run yet. This tension is fundamental to long-horizon
agentic work, and faultline's learnings system is designed to evolve as we
learn more about what works.

**Design principle: never lose the raw signal.** The system stores learnings in
two tiers so that compression decisions are always reversible.

#### Tier 1: Full log (append-only, not sent to Claude)

**Location:** `.faultline/learnings.log.json`

Every observation from every phase goes into the full log, timestamped and
tagged. This file has no size limit. It is the system's complete memory and
exists so that compression of the active set is always recoverable -- if a
future phase needs something that was compressed away, the full log is available
for the harness to re-derive a better active set.

```json
{
  "entries": [
    {
      "id": "learn-001",
      "type": "data_contract",
      "source_phase": "survey",
      "source_step": "1e-architecture",
      "timestamp": "2025-01-15T10:23:00Z",
      "insight": "Inter-module communication uses a custom event bus; modules publish domain events that other modules subscribe to",
      "relevant_domains": ["notifications", "commerce", "auth"],
      "tokens_est": 35
    },
    {
      "id": "learn-002",
      "type": "shared_invariant",
      "source_phase": "extract",
      "source_domain": "auth/identity",
      "source_batch": 2,
      "timestamp": "2025-01-15T11:45:00Z",
      "insight": "User model uses soft-delete (is_active flag); other domains check this flag at query time rather than relying on cascading deletes",
      "relevant_domains": ["commerce/checkout", "permissions", "notifications"],
      "tokens_est": 30
    }
  ]
}
```

#### Tier 2: Active set (bounded, sent to Claude)

**Location:** `.faultline/learnings.json`

A compressed, curated view of the full log, sized to fit alongside other
context in any invocation. The active set is capped at 3,000 tokens. It is
regenerated from the full log by the harness whenever it exceeds the budget or
at phase transitions.

The active set uses the same entry format as the full log.

#### Entry types and retention

Not all learnings are equal. Each entry is typed, and types carry different
retention priorities during compression:

| Type | Description | Retention |
|------|-------------|-----------|
| `data_contract` | How one domain exposes data or behavior to another | High -- these are the seams of the system. Dropping one means a spec misses a critical interface. |
| `shared_invariant` | A rule or assumption that multiple domains depend on | High -- if lost, invariants get duplicated inconsistently or omitted. |
| `contradiction` | Two domains describe the same behavior differently | Highest -- the single most valuable finding type. Never compress away. |
| `pattern` | An implementation pattern used across modules (event bus, middleware chain, etc.) | Medium -- useful context but not essential for correct specs. |
| `hypothesis` | A tentative observation that needs confirmation ("this might relate to billing") | Low -- valuable when fresh, less so once confirmed or denied by later phases. |

During compression, the harness applies these retention priorities
structurally: contradictions are never removed, data contracts and shared
invariants are removed only as a last resort, patterns are summarized, and
stale hypotheses are dropped first. If the structurally-filtered set still
exceeds the budget, the harness invokes Claude to perform semantic compression
-- merging related entries and tightening language while preserving meaning.

#### Who writes

- **Step 1e (architecture):** The architecture agent appends insights about
  cross-cutting patterns (event buses, shared middleware, common data access
  patterns). The harness extracts these from a structured section in the
  architecture prompt output. Typical types: `pattern`, `data_contract`.
- **Step 2 (extraction):** The consolidation agent appends discoveries about
  cross-domain data contracts, shared invariants, or assumptions about other
  domains. These come from a "Cross-Domain Observations" section in the
  consolidation prompt. Typical types: `data_contract`, `shared_invariant`,
  `hypothesis`.
- **Step 2.5 (reconciliation):** The reconciliation agent appends findings
  about contradictions, duplications, and missing handoff points. Typical
  types: `contradiction`, `shared_invariant`.

All writes go to *both* the full log and the active set. The harness triggers
compression of the active set when it exceeds the 3k token budget.

#### Who reads

- **Step 2 (extraction):** Each extraction invocation receives a filtered view
  of the active set -- entries where `relevant_domains` includes the current
  domain, plus all `shared_invariant` and `contradiction` entries. The harness
  performs this filtering.
- **Step 2.5 (reconciliation):** Receives the full active set.
- **Step 3 (synthesis):** Every synthesis invocation receives the full active
  set. At ≤3k tokens, this always fits alongside other context.

#### Future evolution

The learnings system is designed to be the simplest thing that works now, with
clear extension points for later refinement:

- **Consumer-driven views.** Instead of one active set for all consumers, the
  harness could generate task-specific compressions (e.g., extraction-optimized
  vs. synthesis-optimized views derived from the full log). The full log makes
  this possible without re-running the pipeline.
- **Citation tracking.** Entries referenced by multiple downstream consumers
  could be promoted in retention priority. A learning cited by three
  independent extractors is more likely to be a real system-wide invariant than
  one noted once. The entry format has room for a `cited_by` field.
- **Phase-aware recompression.** The active set could be regenerated at each
  phase transition with a compression strategy tuned to what's coming next
  (emphasize data contracts before extraction, contradictions before
  reconciliation, business-rule invariants before synthesis).

These are noted here as design direction, not current requirements. The full
log ensures no signal is permanently lost, so the compression and retrieval
strategy can be refined based on real-world usage without re-running pipelines.

---

## Phase 1: Survey

**Goal:** Build a complete map of the codebase. Classify every file. Identify
domains. Validate domain assignments. Plan extraction batches. Describe the
current architecture.

Survey itself may require multiple Claude invocations for very large codebases.
The harness splits the work.

### Step 1a: Index (harness, no Claude)

The harness traverses the *entire* file tree (no depth limit) and builds
`file_index.json`:

```json
{
  "total_files": 14832,
  "total_tokens_est": 28400000,
  "files": [
    {
      "path": "src/auth/middleware/jwt.ts",
      "size_bytes": 2340,
      "tokens_est": 585,
      "extension": ".ts",
      "language": "typescript",
      "category": null
    }
  ]
}
```

**Category** is null at this stage -- Claude assigns it in the next step.
**Language** is inferred from extension (a simple mapping table in the harness).
**Token estimate** uses `ceil(size_bytes / 4)` for code, `ceil(size_bytes / 5)`
for prose/markdown.

The harness also reads and stores:
- Dependency manifests → `manifest.json`
- README / top-level docs (text content, not paths)
- Config files (`.env.example`, docker-compose, CI, linter configs, tsconfig)
- The raw `tree` output → `tree.txt`

### Step 1b: Classify (Claude, possibly batched)

**Problem:** 14,000 file *paths* alone could be ~100k tokens. We can't send them
all at once for very large projects.

**Strategy:** Send file paths in batches of ~8,000 files (≈60k tokens of paths),
plus the dependency manifest and README for context. Each batch produces
classifications that the harness merges.

**Input to Claude per batch:**
- Batch of file paths (with sizes and extensions)
- `manifest.json` (dependency info)
- README content
- Previously classified domains (from earlier batches, as summary)

**Claude produces per batch:**
```json
{
  "classifications": [
    {
      "path": "src/auth/middleware/jwt.ts",
      "category": "source",
      "domain_hint": "auth"
    },
    {
      "path": "scripts/deploy.sh",
      "category": "infra",
      "domain_hint": "_cross_cutting"
    }
  ]
}
```

**Categories:** `source`, `test`, `migration`, `config`, `infra`, `doc`,
`generated`, `asset`, `dependency` (vendored), `unknown`.

The harness merges all batch results back into `file_index.json`.

### Step 1c: Domain mapping (Claude, single invocation)

With all files classified, the harness builds a compressed view: directories
grouped by domain hints, with file counts and total token estimates per
directory. This compressed view fits in one context window even for huge
projects.

**Input to Claude:**
- Directory-level summary (not individual files): path, file count, total tokens,
  dominant category, domain hints from classification
- `manifest.json`
- README content
- Entry points (files named `main`, `index`, `app`, `server`, etc.)

**Claude produces `domains.json`:**
```json
{
  "domains": [
    {
      "id": "auth",
      "label": "Authentication & Identity",
      "description": "User accounts, credential verification, token management",
      "directories": ["src/auth/", "src/middleware/auth/"],
      "key_files": ["src/models/user.ts"],
      "estimated_tokens": 45000,
      "priority": "high",
      "depends_on": [],
      "sub_domains": [
        {
          "id": "auth/identity",
          "label": "User Identity & Accounts",
          "directories": ["src/auth/models/", "src/auth/services/user/"],
          "estimated_tokens": 22000
        },
        {
          "id": "auth/sessions",
          "label": "Session & Token Management",
          "directories": ["src/auth/middleware/", "src/auth/services/token/"],
          "estimated_tokens": 23000
        }
      ]
    }
  ],
  "cross_cutting": [
    {
      "id": "_logging",
      "label": "Logging & Observability",
      "directories": ["src/lib/logger/"],
      "estimated_tokens": 8000
    }
  ],
  "unclassified": {
    "directories": ["src/utils/"],
    "estimated_tokens": 12000,
    "note": "Utility grab-bag — contents distributed to domains where possible"
  }
}
```

**Sub-domain splitting heuristic:** If a domain exceeds 80k estimated tokens,
Claude should propose sub-domains. The harness enforces this -- if Claude returns
a domain > 80k tokens without sub-domains, it prompts again with an explicit
split request.

### Step 1c′: Domain review (Claude, single invocation)

Domain classification is the highest-leverage decision in the pipeline. A
misassigned directory cascades through extraction, consolidation, and synthesis.
Before committing to the extraction plan, an adversarial reviewer validates
`domains.json`.

**Model: sonnet** (sufficient for structural validation, keeps cost low).

**Input to Claude:**
- `domains.json`
- `file_index.json` (directory-level summary, same compressed view used in 1c)
- `manifest.json`
- README content

**The reviewer checks for:**

1. **Orphaned directories.** Any directory in `file_index.json` that appears in
   zero domains (excluding directories matched by `--exclude` or categorized as
   `dependency`, `generated`, or `asset`). These are missed assignments.
2. **Suspiciously thin domains.** A domain with fewer than 3 source files or
   under 2,000 estimated tokens is likely incomplete -- files that belong to it
   were probably assigned elsewhere.
3. **Overloaded cross-cutting.** If `_cross_cutting` or `unclassified` exceeds
   25% of total source tokens, too much was punted. The reviewer identifies
   directories within those buckets that look domain-specific (heuristic: the
   directory name or its parent path contains a domain keyword from
   `domains.json`).
4. **Missing dependency edges.** If domain A's directories are imported by files
   in domain B (detectable via directory co-occurrence in the path index), but
   A does not appear in B's `depends_on`, flag the missing edge.
5. **Oversized domains without sub-domains.** Re-check the 80k token heuristic.
   The domain mapper may have returned domains just under the threshold that
   would benefit from splitting.

**Claude produces `domain_review.json`:**

```json
{
  "passed": false,
  "issues": [
    {
      "type": "orphaned_directory",
      "directory": "src/billing/webhooks/",
      "tokens_est": 8500,
      "suggested_domain": "commerce/checkout",
      "reasoning": "Contains Stripe webhook handlers, closely related to checkout flow"
    },
    {
      "type": "overloaded_cross_cutting",
      "directory": "src/utils/permissions/",
      "tokens_est": 4200,
      "suggested_domain": "permissions",
      "reasoning": "Permission-checking utilities are domain logic, not generic utilities"
    }
  ],
  "suggestions": [
    {
      "type": "missing_dependency",
      "from": "notifications",
      "to": "auth/identity",
      "reasoning": "Notification templates directory mirrors user model fields"
    }
  ]
}
```

**Feedback loop.** If `passed` is false, the harness appends the issues to the
domain mapping prompt and re-invokes Step 1c (the domain mapper, not the
reviewer). Cap at 1 retry. If the retry still fails review, proceed anyway but
log a warning -- the issues feed into `learnings.json` for downstream awareness.

**Why a separate reviewer instead of a better domain mapper prompt?** Same
reasoning as Ridgeline's build/review separation: the mapper is constructive
(proposing structure), the reviewer is adversarial (finding holes). Combining
both roles in one prompt degrades both. The mapper optimizes for coherent
groupings; the reviewer optimizes for coverage and correctness. Separating them
keeps each focused.

### Step 1c″: Domain sampling (harness + Claude, single invocation)

As a lightweight supplement to the domain review, the harness validates
assignments by sampling actual file contents.

**Harness logic (no Claude):**
- For each domain, select 2-3 representative files: the largest source file,
  one file from the most deeply nested subdirectory, and one file whose name
  does not obviously match the domain label (if any exist).
- For `_cross_cutting` and `unclassified`, select up to 5 files.
- Total sample budget: ~30k tokens (enough for ~60 files at ~500 tokens each).

**Input to Claude:**
- The sampled file contents with their current domain assignments
- `domains.json` (labels and descriptions only, not full directory lists)

**Claude produces a verdict:** For each sampled file, confirm or challenge its
assignment. Challenges include a suggested reassignment with reasoning.

The harness applies confirmed reassignments to `file_index.json` and
regenerates the affected portions of `domains.json`. This is a light touch --
it does not re-run the full domain mapping, just patches the specific files
that were flagged.

**Cost:** One invocation at ~30-40k input tokens. Cheap insurance against the
most damaging classification errors.

### Step 1d: Extraction plan (harness, no Claude)

The harness reads `domains.json` and `file_index.json` to produce
`extraction_plan.json` -- a concrete list of extraction tasks with token budgets:

```json
{
  "context_budget": 150000,
  "tasks": [
    {
      "id": "extract-auth-identity",
      "domain": "auth/identity",
      "files": ["src/auth/models/user.ts", "src/auth/services/user/..."],
      "total_tokens_est": 22000,
      "fits_single_pass": true,
      "batches": [
        {
          "batch": 1,
          "files": ["...all files..."],
          "tokens_est": 22000
        }
      ]
    },
    {
      "id": "extract-commerce-checkout",
      "domain": "commerce/checkout",
      "files": ["..."],
      "total_tokens_est": 180000,
      "fits_single_pass": false,
      "batches": [
        {
          "batch": 1,
          "label": "models + schema",
          "files": ["..."],
          "tokens_est": 65000
        },
        {
          "batch": 2,
          "label": "routes + controllers",
          "files": ["..."],
          "tokens_est": 72000
        },
        {
          "batch": 3,
          "label": "services + helpers",
          "files": ["..."],
          "tokens_est": 43000
        }
      ]
    }
  ]
}
```

**Batching strategy for oversized domains:**

When a domain's source exceeds the context budget, the harness splits by layer:

1. **Models / types / schema** first (these define the domain's data shape)
2. **Routes / controllers / handlers** second (these define the interface)
3. **Services / business logic** third
4. **Tests** fourth (if they exist and add signal)

Within each layer, files are packed greedily up to the budget. Each batch
carries a summary of what previous batches in the same domain found (the
prior batch's notes, compressed to ~2k tokens by the harness).

### Step 1e: Architecture description (Claude, single invocation)

**Input to Claude:**
- `domains.json`
- `manifest.json`
- Directory structure (tree output, truncated to fit)
- Config files (docker-compose, CI, infra configs)
- Entry point file contents (just the main entry points, not everything)

**Claude produces `architecture.md`:**

A description of the *current* system architecture -- what's actually there, not
what should be. This includes: tech stack, runtime topology (monolith vs
microservices, client/server split), data stores, external integrations, build
and deployment pipeline, and how modules are organized. Implementation-specific
details are appropriate here (unlike the specs). This file serves as reference
context for anyone reading the specs who wants to understand the starting point.

The architecture prompt also includes a structured section requesting
cross-cutting observations: shared patterns, inter-module communication
mechanisms, common data access strategies. The harness extracts these and writes
them as the initial entries in both `learnings.log.json` (full log) and
`learnings.json` (active set).

---

## Phase 2: Extract

**Goal:** For each extraction task in the plan, read the actual source files and
produce observation notes.

### Execution model

Each task in `extraction_plan.json` runs as one or more Claude invocations.
Tasks are independent and can run in parallel (up to `--concurrency`). Within
a multi-batch task, batches run serially (each needs the prior batch's notes).

**Model: opus** (extraction requires deep code comprehension and the ability to
reason about implicit business rules in messy code).

### Per-batch invocation

**Input to Claude:**
- System prompt (extraction rules, abstraction guidelines)
- Domain context: the domain's entry from `domains.json` (label, description,
  relationships)
- Architecture summary: a ~1k token digest of `architecture.md`
- Learnings relevant to this domain (filtered from `learnings.json`)
- Prior batch context (if batch > 1): the previous batch's notes, compressed to
  ~2k tokens
- Source files for this batch (with file-path headers)
- Related tests (if they fit in remaining budget)

**Claude produces `batch-{nn}.notes.md`:**

```markdown
# Extraction: Auth / Identity -- Batch 1 (Models + Schema)

## Business Rules Observed
- Users authenticate via email + password
- Email addresses are unique, case-insensitive (lowercased before storage)
- Passwords are stored as bcrypt hashes (cost factor 10)
- ...

## Data Invariants
- Every user has exactly one role assignment
- Email uniqueness is enforced at the database level (unique index)
- ...

## Gaps & Ambiguities
- No email verification exists
- ...

## Cross-Domain Observations
- User model uses soft-delete (is_active flag) checked by other modules
- Token generation relies on a shared secret configuration pattern
- ...

## Notes for Next Batch
- User model defines `role_id` FK — look for role resolution in services
- Token generation imports from `src/auth/services/token/` — not yet read
```

The "Notes for Next Batch" section is critical -- it's the handoff context that
lets batch 2 pick up coherently without re-reading batch 1's source files.

The "Cross-Domain Observations" section is new -- it captures anything the
extractor notices about how this domain interacts with or depends on other
domains. The harness extracts these and appends them to `learnings.json`.

### Consolidation (Claude, per domain)

After all batches for a domain complete, the harness invokes Claude once more to
merge all `batch-*.notes.md` files into `consolidated.notes.md`:

**Input:**
- All batch notes for this domain (concatenated)
- Domain entry from `domains.json`

**Claude produces `consolidated.notes.md`:**
- Deduplicated, organized, internally consistent
- Must be ≤4,000 words (~5k tokens)
- If the raw batch notes exceed 15k tokens combined, Claude is instructed to
  compress aggressively -- keep rules and invariants, drop implementation
  observations
- Includes a consolidated "Cross-Domain Observations" section, which the harness
  appends to `learnings.json`

### Extraction review (Claude, per domain)

After consolidation produces `consolidated.notes.md` for a domain, a reviewer
agent checks the notes for quality before they feed into synthesis.

**Model: sonnet** (structural checks, not deep comprehension).

**Input to Claude:**
- `consolidated.notes.md` for this domain
- The domain's file list from `extraction_plan.json` (paths only)
- Domain entry from `domains.json` (label, description, dependencies)
- Learnings entries relevant to this domain

**The reviewer checks for:**

1. **File coverage.** Every source file in the domain's extraction plan should
   be referenced at least once in the notes (by filename or by the business
   concept it implements). Flag files that appear to have been skipped.
2. **Abstraction violations.** Scan for implementation language: file paths,
   function/class names, framework-specific terms (matched against keywords
   from `manifest.json` -- e.g., if the manifest lists Express, flag "Express
   middleware" in the notes). These should be product-language descriptions.
3. **Cross-domain dangling references.** If the notes mention another domain
   (by name or by describing behavior that belongs to another domain), verify
   that the dependency is declared in `domains.json`. Flag undeclared
   dependencies.
4. **Gap plausibility.** If the "Known Gaps" section is empty for a domain with
   >20k tokens of source, that is suspicious -- flag it as potentially
   incomplete gap analysis.

**Claude produces a structured verdict:**

```json
{
  "domain": "auth/identity",
  "passed": true,
  "issues": [],
  "suggestions": [
    {
      "type": "possible_missing_coverage",
      "file": "src/auth/services/user/archive.ts",
      "note": "File not referenced in notes; may contain user archival business rules"
    }
  ]
}
```

**Feedback loop.** If `passed` is false, the harness feeds the issues back to
the consolidation agent (not the extractor -- re-extraction is too expensive).
The consolidation agent receives the original batch notes plus the review
feedback and produces a revised `consolidated.notes.md`. Cap at 1 retry.

**Cost:** One sonnet invocation per domain (~5-10k input tokens). For a
20-domain project, this adds ~20 invocations at low cost. The payoff is catching
abstraction leaks and coverage gaps before they propagate to specs.

### Deep extraction pass (Claude, high-priority domains only)

For domains marked `priority: "high"` in `domains.json`, extraction runs a
second pass after consolidation and review. The rationale: high-priority domains
typically contain core business logic where missed rules are most costly.

**Input to Claude:**
- `consolidated.notes.md` for this domain (the first-pass output)
- A representative subset of the domain's source files (up to 50k tokens,
  selected by the harness: prioritize files not well-covered in the consolidated
  notes, identified by the extraction reviewer)
- Learnings entries relevant to this domain
- Cross-references mentioning this domain (if Phase 2.5 has already run)

**Claude produces `deep_pass.notes.md`:**

The prompt instructs Claude to read the consolidated notes, then read the
source files looking specifically for:
- Business rules that the first pass described vaguely or incompletely
- Rules that the first pass missed entirely
- Implicit invariants that only become visible when reading multiple files
  together (e.g., a validation pattern applied inconsistently across endpoints)
- Behavioral edge cases buried in error-handling code

The harness then re-runs consolidation, merging `deep_pass.notes.md` with the
existing `consolidated.notes.md`. The size ceiling (5k tokens) still applies.

**When to skip:** If the extraction reviewer's verdict was `passed` with no
suggestions, the deep pass is skipped even for high-priority domains -- the
first pass was sufficient.

**Cost:** One opus invocation per high-priority domain. Expected to trigger on
2-4 domains for a typical project. The cost is justified by the disproportionate
impact of core domain spec quality.

### Extraction loop & retry

Like ridgeline's build/review cycle, extraction tasks can fail or produce
inadequate results. The harness checks:

1. **Output exists and parses** -- the notes file was produced and has the
   expected sections
2. **Size check** -- consolidated notes are within the 5k token ceiling
3. **Coverage check** -- every file in the batch was referenced at least once in
   the notes (simple grep for filenames)

Failed checks trigger a retry (up to `--max-retries`, default 2) with feedback
appended to the prompt.

---

## Phase 2.5: Reconcile

**Goal:** Detect cross-domain duplications, contradictions, and missing handoff
points that single-domain extraction cannot see.

### The problem

Extraction is per-domain by design -- each extractor sees only its own source
files. But business rules frequently span domains. A checkout flow depends on
auth, inventory, and payment. An event published by one domain is consumed by
three others. These relationships are partially captured by `domains.json`
dependency edges, but the actual behavioral contracts (what data crosses the
boundary, what invariants both sides assume) only become visible after reading
the code.

The synthesis phase (Step 3b) receives all domain summaries, but summaries are
500-token compressions -- too sparse to catch subtle contradictions like "auth
says tokens expire in 15 minutes, but checkout assumes tokens last for the
duration of a session."

### Strategy: cluster-based reconciliation

Full N×N domain comparison is O(n²) invocations and wasteful -- most domain
pairs have no meaningful interaction. Instead, the harness identifies clusters
of related domains and reconciles within each cluster.

### Step 2.5a: Cluster identification (harness, no Claude)

The harness builds a domain interaction graph from two sources:

1. **Declared dependencies** from `domains.json` (`depends_on` edges).
2. **Observed references** from consolidated notes (grep each domain's notes
   for other domain IDs or labels).

Connected components in this graph form natural clusters. If a connected
component exceeds 5 domains, split it by removing the weakest edges (fewest
references) until no cluster exceeds 5. Isolated domains (no edges) are
skipped -- they have no cross-domain concerns.

**Output:** A cluster plan listing domain groups and their combined token
estimates (sum of `consolidated.notes.md` sizes per cluster).

### Step 2.5b: Per-cluster reconciliation (Claude, per cluster)

**Model: opus** (cross-domain reasoning requires the same depth as extraction).

**Input to Claude:**
- System prompt (reconciliation rules)
- All `consolidated.notes.md` files for domains in this cluster (3-5 domains,
  15-25k tokens total)
- Relevant entries from `learnings.json`
- Domain entries from `domains.json` for the cluster (labels, descriptions,
  declared dependencies)

**Claude produces a reconciliation report per cluster:**

```json
{
  "cluster": ["auth/identity", "auth/sessions", "permissions", "commerce/checkout"],
  "findings": [
    {
      "type": "duplicate_rule",
      "description": "Both auth/identity and permissions describe role assignment. Auth says 'single role per user', permissions says 'users have one or more roles'. These contradict.",
      "domains": ["auth/identity", "permissions"],
      "resolution_hint": "Determine which is authoritative by checking the data model in extraction notes."
    },
    {
      "type": "missing_handoff",
      "description": "Checkout assumes a 'current user' context is available but auth/sessions does not describe how session context is propagated to downstream domains.",
      "domains": ["auth/sessions", "commerce/checkout"],
      "resolution_hint": "The spec for auth/sessions should describe what session data is available to consuming domains."
    },
    {
      "type": "shared_invariant",
      "description": "All four domains assume users have an 'is_active' flag that gates access. This is a system-wide invariant that belongs in the overview spec, not repeated in each domain.",
      "domains": ["auth/identity", "auth/sessions", "permissions", "commerce/checkout"],
      "resolution_hint": "Promote to overview spec as a system-wide rule."
    },
    {
      "type": "undeclared_dependency",
      "description": "Commerce/checkout references notification triggers on order completion, but notifications is not in this cluster or in checkout's depends_on.",
      "domains": ["commerce/checkout"],
      "resolution_hint": "Add notifications to checkout's depends_on in domains.json."
    }
  ]
}
```

The harness merges all cluster reports into `extractions/cross_references.json`.

**Learnings update:** The reconciliation agent's findings about shared
invariants and contradictions are appended to `learnings.json`.

### How reconciliation feeds synthesis

`cross_references.json` becomes additional input to two synthesis steps:

- **Step 3b (per-domain spec writing):** Each domain receives the subset of
  findings that mention it. The spec writer is instructed to resolve
  contradictions (picking the version supported by the data model), document
  handoff contracts in the "Relationships" section, and avoid duplicating rules
  flagged as system-wide.
- **Step 3c (overview spec):** Receives all findings. Shared invariants and
  system-wide rules go here.

### Cost

One opus invocation per cluster. For a 20-domain project with ~5 clusters,
that is ~5 invocations at 15-25k input tokens each. Significant but bounded,
and the value is high -- this is where the most damaging cross-domain
inconsistencies get caught.

---

## Phase 3: Synthesize

**Goal:** Transform domain notes into final PRDs, architecture doc, constraints,
and taste.

### The context problem at synthesis

At synthesis time, we need cross-domain awareness (to deduplicate, resolve
references, maintain consistency) but we can't load all domain notes
simultaneously if the project has 30+ domains.

**Solution: two-tier synthesis, informed by reconciliation.**

### Step 3a: Domain summaries (harness + Claude, batched)

First, compress every domain's consolidated notes into a ~500 token summary.
This can be batched -- pack as many domain notes as fit into context and ask
Claude to summarize each.

**Output: `domain_summaries.json`**

```json
{
  "summaries": [
    {
      "domain": "auth/identity",
      "label": "User Identity & Accounts",
      "summary": "Credential-based user accounts with email/password. Unique emails, bcrypt hashing. Single-role assignment per user. No email verification or password reset.",
      "tokens_est": 45,
      "depends_on": ["permissions"],
      "depended_on_by": ["commerce/checkout", "notifications"]
    }
  ]
}
```

The full set of domain summaries should fit in a single context window even for
very large projects (30 domains × 500 tokens = 15k tokens).

### Step 3b: Per-domain spec writing (Claude, per domain)

**Input to Claude:**
- System prompt (spec writing rules, abstraction guidelines, ridgeline format)
- This domain's `consolidated.notes.md` (full text, ≤5k tokens)
- All domain summaries from `domain_summaries.json` (for cross-references)
- Cross-reference findings mentioning this domain (from `cross_references.json`)
- Learnings file (full, ≤3k tokens)
- `architecture.md` digest (~1k tokens, for grounding)

**Claude produces one or more spec files for the domain.**

The prompt instructs Claude to decide whether the domain warrants a single spec
or multiple sub-specs. Criteria:

- If the domain has 2+ distinct user-facing flows or capability areas → split
- If a single spec would exceed ~3,000 words → split
- Name each file with a numbered prefix: `01-identity.md`, `02-sessions.md`

Each spec follows ridgeline's format:
```markdown
# [Human-Readable Title]

## Overview
[2-3 sentence summary of what this capability area does]

## Requirements
### [Capability Group]
- [Requirement as a business rule]
- [Requirement as a business rule]
...

## Known Gaps
- [Gap description]
...

## Relationships
- [How this domain connects to others]
```

**No file paths. No function names. No framework APIs. Product language only.**

The spec writer is instructed to resolve contradictions flagged by
reconciliation (picking the version supported by the data model), document
handoff contracts in the "Relationships" section, and avoid duplicating rules
flagged as system-wide invariants (those go in the overview spec).

### Step 3b′: Abstraction enforcement (harness, no Claude)

After spec writing, the harness performs a mechanical scan of each spec file for
implementation language that should not appear in product-level documentation.

**The harness checks for:**

1. **File extensions.** Any occurrence of `.ts`, `.js`, `.py`, `.go`, `.rs`,
   `.java`, `.rb`, `.php`, `.css`, `.html`, `.sql` (and their variants) outside
   of markdown code fences.
2. **Framework names.** Keywords extracted from `manifest.json` dependency
   names: e.g., if the manifest lists `express`, `fastify`, `react`, `django`,
   `spring`, flag those terms in the spec.
3. **Code-like identifiers.** Patterns matching `camelCase` or `snake_case`
   identifiers that are longer than 15 characters (heuristic: these are likely
   function or variable names, not natural English words). Exclude known domain
   terms from `domains.json` labels.
4. **Path-like strings.** Anything matching `src/`, `lib/`, `./`, or containing
   `/` with 2+ path segments.

**Outcome:** Files with violations are re-submitted to the spec writer with a
feedback prompt listing the specific violations and the abstraction rules. Cap
at 1 rewrite per file. Remaining violations after retry are logged as warnings
but do not block the pipeline -- some domain terminology legitimately overlaps
with technical terms.

**Cost:** Zero Claude invocations for the scan. One invocation per flagged file
for the rewrite (expected to be rare if the prompt is good).

### Step 3c: Overview spec (Claude, single invocation)

**Input:**
- All domain summaries
- Domain dependency graph (extracted from summaries)
- All findings from `cross_references.json`
- Learnings file (full)
- Architecture digest

**Claude produces `specs/00-overview.md`:**
A system-level product description. What does this application do? Who are its
users? What are the major capability areas? How do they relate? What are the
system-wide gaps? Shared invariants flagged by reconciliation (e.g., "all
domains enforce an is_active check on user records") are documented here rather
than repeated in individual domain specs.

### Step 3d: Architecture doc (Claude, single invocation)

Takes the raw `survey/architecture.md` and refines it with insights from
extraction. This goes in `output/architecture.md` -- it describes the *current*
implementation architecture (tech stack, topology, data flow, deployment) for
reference. Unlike specs, this file IS implementation-specific -- that's its
purpose.

**Input:**
- `survey/architecture.md`
- All domain summaries (for completeness)
- `manifest.json`

### Step 3e: Constraints (Claude, single invocation)

**Input:**
- `manifest.json`
- Config files (CI, docker, linter, tsconfig)
- Architecture digest
- Domain summaries (to identify tech patterns)

**Output: `constraints.md`** -- ridgeline-compatible.

### Step 3f: Taste (Claude, single invocation)

**Input:**
- 8-12 representative source files chosen by harness:
  - 2-3 from the largest domains
  - 1-2 tests
  - 1-2 configuration/infrastructure files
  - The entry point(s)
- Linter / formatter configs
- `tsconfig.json` / equivalent
- CLAUDE.md / .cursorrules / similar if present

**Output: `taste.md`** -- ridgeline-compatible.

---

## Context Window Strategy Summary

| Phase | Input size risk | Strategy |
|-------|----------------|----------|
| 1b Classify | File paths for 10k+ files | Batch paths (~8k files/batch) |
| 1c Domains | All classifications | Compress to directory-level summaries |
| 1c′ Domain review | domains.json + file index | Single invocation, bounded input |
| 1c″ Domain sampling | 60 sampled files | Single invocation, ~30k tokens |
| 1e Architecture | Entry points + configs | Bounded by file count (≤20 files) |
| 2 Extract | Domain source code | Pre-planned batches within token budget |
| 2 Consolidate | All batch notes per domain | Cap at 5k tokens output |
| 2 Review | Consolidated notes per domain | Single sonnet invocation, ~10k tokens |
| 2 Deep pass | Notes + source subset | High-priority only, ~50k tokens |
| 2.5 Reconcile | 3-5 domains' notes per cluster | ~15-25k tokens per cluster |
| 3a Summaries | All domain notes | Batch; output capped at 500 tokens/domain |
| 3b Specs | 1 domain's notes + summaries + xrefs | Always fits (5k + 15k + 3k + overhead) |
| 3b′ Abstraction check | Spec files (harness scan) | Zero invocations (harness only) |
| 3c Overview | All summaries + all xrefs | Always fits (~15k + ~5k) |
| 3d-f Others | Targeted slices | Always fits by construction |

**Key invariant:** No single file in `.faultline/` should exceed 5k tokens
(~20k chars) except `file_index.json` and `learnings.log.json` (both are only
read by the harness, never sent to Claude wholesale). The active `learnings.json`
is capped at 3k tokens. Anything Claude needs to read is kept within budget.

---

## CLI Interface

```
faultline <target-dir> [options]
```

### Commands

```bash
# Full pipeline
faultline analyze ./my-app

# Step-by-step
faultline survey ./my-app           # Phase 1
faultline extract ./my-app          # Phase 2 (requires survey)
faultline reconcile ./my-app        # Phase 2.5 (requires extract)
faultline synthesize ./my-app       # Phase 3 (requires reconcile, or extract if --skip-reconcile)

# Inspect / debug
faultline dry-run ./my-app          # Show extraction plan, estimated cost
faultline status ./my-app           # Show pipeline state

# Output to ridgeline build
faultline analyze ./my-app --ridgeline my-rebuild
# Writes to .ridgeline/builds/my-rebuild/ in addition to .faultline/

# Resume interrupted run
faultline analyze ./my-app          # Detects .faultline/state.json, resumes
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--output <dir>` | `.faultline/output/` | Final deliverable location |
| `--ridgeline <name>` | none | Also write to `.ridgeline/builds/<name>/` |
| `--model <name>` | `opus` | Model for extraction + synthesis |
| `--survey-model <name>` | `sonnet` | Model for survey (cheaper, sufficient) |
| `--timeout <minutes>` | `30` | Max per-invocation duration |
| `--max-budget-usd <n>` | none | Total cost ceiling |
| `--concurrency <n>` | `3` | Parallel extraction tasks |
| `--max-retries <n>` | `2` | Retries per failed task |
| `--include <glob>` | `**/*` | Files to include |
| `--exclude <glob>` | (see defaults) | Files to exclude |
| `--context-budget <n>` | `150000` | Tokens available per invocation |
| `--shapes` | off | Also generate shapes/ output |
| `--skip-reconcile` | off | Skip Phase 2.5 (faster, less cross-domain checking) |
| `--skip-deep-pass` | off | Skip deep extraction for high-priority domains |

**Default excludes:** `node_modules`, `vendor`, `dist`, `build`, `.git`,
`package-lock.json`, `yarn.lock`, `*.min.js`, `*.map`, `*.png`, `*.jpg`,
`*.gif`, `*.ico`, `*.woff*`, `*.ttf`, `*.eot`, `*.mp4`, `*.pdf`.

---

## Compaction vs Fresh Context: The Decision

After careful consideration, **fresh context windows** (ridgeline-style phased
execution) are the right choice for faultline:

**Why not compaction (long-running single session):**
- Compaction discards tokens unpredictably -- in code analysis, the "boring"
  middle of a file might contain the critical business rule
- Cost is harder to predict and control
- No natural resume points -- a crash loses everything
- The model's attention degrades over very long contexts even without compaction
- Difficult to parallelize

**Why phased execution works here:**
- The survey phase produces a *structured plan* that subsequent phases follow
  deterministically -- you don't need the surveyor's "train of thought" later,
  just its outputs
- Extraction is inherently per-domain -- domains are independent by definition
- Synthesis only needs compressed intermediate artifacts, not raw source
- Each phase's output serves as explicit, reviewable handoff context
- The harness can retry individual tasks without re-running the whole pipeline

**The tradeoff -- lost cross-domain signal during extraction:**
- Mitigated by the learnings log, which carries cross-domain observations
  discovered at each step forward to subsequent steps
- Mitigated by the reconciliation phase (2.5), which explicitly compares
  related domains' notes and flags contradictions, duplications, and missing
  handoff points before synthesis begins
- The consolidation step catches most within-domain duplication
- The synthesis step has full cross-domain visibility via domain summaries,
  cross-references, and learnings

---

## Pipeline Visualization

```
                    ┌──────────────────────────────────┐
                    │          SURVEY (Phase 1)         │
                    │                                   │
                    │  1a. Index ──(harness)──→ file_index.json
                    │  1b. Classify ─(claude)──→ classifications
                    │  1c. Domains ──(claude)──→ domains.json
                    │  1c′ Review ──(claude)───→ domain_review.json
                    │      ↻ retry 1c if failed         │
                    │  1c″ Sample ──(claude)───→ patch file_index
                    │  1d. Plan ────(harness)──→ extraction_plan.json
                    │  1e. Arch ────(claude)───→ architecture.md
                    │      └→ learnings.json (initial)  │
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────▼───────────────────┐
                    │         EXTRACT (Phase 2)         │
                    │                                   │
                    │  For each domain (parallel):      │
                    │    For each batch (serial):       │
                    │      Read source → notes          │
                    │    Consolidate batches → notes    │
                    │    Review ──→ retry if needed     │
                    │    Deep pass (high-priority only) │
                    │    └→ learnings.json (append)     │
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────▼───────────────────┐
                    │       RECONCILE (Phase 2.5)       │
                    │                                   │
                    │  Build domain interaction graph   │
                    │  Cluster related domains (≤5 each)│
                    │  Per-cluster reconciliation       │
                    │  └→ cross_references.json         │
                    │  └→ learnings.json (append)       │
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────▼───────────────────┐
                    │       SYNTHESIZE (Phase 3)        │
                    │                                   │
                    │  3a. Compress → domain_summaries  │
                    │  3b. Per-domain → spec files      │
                    │  3b′ Abstraction check (harness)  │
                    │  3c. Overview → 00-overview.md    │
                    │  3d. Architecture → architecture.md
                    │  3e. Constraints → constraints.md │
                    │  3f. Taste → taste.md             │
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────▼───────────────────┐
                    │        OUTPUT / RIDGELINE         │
                    │                                   │
                    │  Copy to --output or              │
                    │  .ridgeline/builds/<name>/        │
                    └──────────────────────────────────┘
```

---

## Implementation Plan (as ridgeline phases)

This tool will be built using ridgeline. The following phases are the
decomposition for the ridgeline build.

### Phase 1: Project scaffold + CLI skeleton
- TypeScript project matching ridgeline's toolchain (commander, vitest, oxlint)
- `faultline` binary with subcommands: `analyze`, `survey`, `extract`,
  `reconcile`, `synthesize`, `dry-run`, `status`
- `stores/config.ts`: resolve CLI flags, `.faultline/config.json`, and defaults
- `stores/state.ts`: read/write `state.json` with phase/task status tracking,
  resume detection
- `stores/budget.ts`: per-invocation cost logging to `budget.json`
- `stores/learnings.ts`: read/write both `learnings.log.json` (full log) and
  `learnings.json` (active set), filter by relevant domains, typed entry
  management, enforce 3k token active set ceiling with structural retention
  logic and compression trigger. Design for future extension (consumer-driven
  views, citation tracking).
- `ui/log.ts`: structured logging helpers
- Acceptance: `faultline --help` works, `faultline status` reports "no state"

### Phase 2: File indexer + survey harness
- `engine/file_walker.ts`: recursive traversal (full tree, respects
  `--include`/`--exclude`)
- `engine/token_estimator.ts`: bytes to estimated tokens by file type
- Language detector (extension mapping, lives in `file_walker` or
  `token_estimator`)
- `stores/survey.ts`: write/read `file_index.json`, `manifest.json`, `tree.txt`
- Manifest parser (package.json, Cargo.toml, requirements.txt, go.mod, etc.)
- Tree output generator
- Acceptance: `faultline survey ./fixture` produces `file_index.json`,
  `manifest.json`, `tree.txt`

### Phase 3: Claude invocation layer
- `engine/claude/invoke.ts`: `claude --print` wrapper with timeout, cost
  capture, retry with exponential backoff, process registry for SIGINT cleanup
- `engine/claude/prompt_loader.ts`: load `.md` templates from `src/agents/`,
  interpolate `{{variables}}`
- `engine/claude/response_parser.ts`: extract JSON and markdown blocks from
  stdout, structured output validation
- `engine/batcher.ts`: given a list of items + token estimates + budget,
  produce batches
- `ui/spinner.ts`: progress indicator during Claude invocations
- Acceptance: unit tests for batching, template loading, response parsing

### Phase 4: Survey agents (classify + domains + architecture)
- `engine/pipeline/survey.exec.ts`: orchestrate the full survey sequence
  (index, classify, domains, domain review, domain sampling, plan, architecture)
- Classification prompt + batched invocation
- Domain mapping prompt + invocation
- Domain review agent: invoke reviewer after domain mapping, parse verdict,
  retry domain mapper if failed (cap 1 retry)
- Domain sampling validation: file selection logic, sample-based classification
  check, patch application to `file_index.json`
- Extraction plan generator (harness logic in `survey.exec.ts`: batch domains
  by token budget, split oversized domains by layer)
- Architecture prompt + invocation, with cross-cutting observations extracted
  to `learnings.json`
- `stores/survey.ts`: write `domains.json`, `domain_review.json`,
  `extraction_plan.json`, `architecture.md`
- Acceptance: `faultline survey ./fixture` produces complete survey output
  including `domains.json`, `domain_review.json`, `extraction_plan.json`,
  `architecture.md`, and `learnings.json` initialized with architecture insights

### Phase 5: Extraction agents
- `engine/pipeline/extract.exec.ts`: orchestrate extraction loop
- Per-task extraction: read files, invoke Claude, write notes (with learnings
  filtered to current domain included in context)
- Multi-batch domain handling (serial batches with handoff context)
- Consolidation agent (merge batch notes into consolidated notes, with
  cross-domain observations section)
- Extraction review agent: per-domain review after consolidation, structured
  verdict, feedback loop to consolidation agent (cap 1 retry)
- Deep extraction pass: conditional re-extraction for high-priority domains
  with reviewer suggestions, merge into consolidated notes
- Learnings append: consolidation agent writes cross-domain observations to
  `learnings.json`
- Validation checks (output exists, size ceiling, file coverage)
- Retry loop with feedback
- Parallel execution with concurrency limit (process registry in
  `engine/claude/invoke.ts` tracks all live subprocesses)
- `stores/extractions.ts`: write/read batch notes, consolidated notes per
  domain, extraction review verdicts
- Acceptance: `faultline extract ./fixture` produces reviewed consolidated notes
  per domain with correct token budgets and extraction review verdicts

### Phase 6: Cross-domain reconciliation
- `engine/pipeline/reconcile.exec.ts`: cluster identification from domain
  interaction graph, per-cluster invocation, report merging
- Cluster identification: build graph from `domains.json` dependency edges +
  observed references in consolidated notes, split oversized components
- Per-cluster reconciliation prompt + invocation
- `stores/extractions.ts`: write `cross_references.json`
- Learnings append from reconciliation findings
- Acceptance: `faultline reconcile ./fixture` produces `cross_references.json`
  with findings for each cluster

### Phase 7: Synthesis agents
- `engine/pipeline/synthesize.exec.ts`: orchestrate synthesis sequence
  (summaries, specs, abstraction check, overview, architecture, constraints,
  taste)
- Domain summary compressor (batched)
- Per-domain spec writer (decides single vs multi-file, writes to domain
  subfolder; receives cross-references and learnings)
- Abstraction enforcement: harness-level scan for implementation language in
  spec files, conditional rewrite with feedback (cap 1 per file)
- Overview spec writer (receives all cross-references and learnings; documents
  system-wide invariants)
- Architecture refinement agent
- Constraints extractor
- Taste extractor
- `stores/output.ts`: assemble final deliverables to `--output` directory,
  optional copy to `.ridgeline/builds/<name>/`
- Acceptance: `faultline synthesize ./fixture` produces complete output
  directory with no flagged implementation terms after abstraction enforcement

### Phase 8: Integration + polish
- End-to-end `faultline analyze` command (chains all phases via pipeline modules)
- Resume logic in `stores/state.ts` (detect existing state, skip completed tasks)
- `dry-run` command (show plan + cost estimate without invoking Claude, formatted
  via `ui/reporter.ts`)
- `status` command (pretty-print pipeline state via `ui/reporter.ts`)
- `--skip-reconcile` and `--skip-deep-pass` flag handling
- Graceful interruption: SIGINT handler calls `kill_all_claude()` from
  `engine/claude/invoke.ts`, then saves state via `stores/state.ts`
- README, usage docs
- Acceptance: full pipeline on a non-trivial open-source codebase

---

## Agent Prompts

```
src/agents/
├── survey/
│   ├── classify.md              # File classification prompt
│   ├── domains.md               # Domain mapping prompt
│   ├── domain_review.md         # Adversarial domain review prompt
│   └── architecture.md          # Architecture description prompt
├── extract/
│   ├── system.md                # Core extraction rules
│   ├── consolidate.md           # Batch merging prompt (includes cross-domain observations section)
│   ├── review.md                # Extraction review prompt
│   ├── deep_pass.md             # Second-pass extraction for high-priority domains
│   └── validate_feedback.md     # Retry feedback template
├── reconcile/
│   └── system.md                # Cross-domain reconciliation prompt
├── synthesize/
│   ├── summarize.md             # Domain summary compression
│   ├── spec.md                  # Per-domain spec writer (receives cross-refs + learnings)
│   ├── overview.md              # System overview writer (receives cross-refs + learnings)
│   ├── architecture.md          # Architecture refinement
│   ├── constraints.md           # Constraints extraction
│   └── taste.md                 # Taste extraction
└── shared/
    ├── abstraction_rules.md     # "Describe business rules, not code"
    └── ridgeline_format.md      # What ridgeline specs look like
```

### Abstraction rules (shared across extraction + synthesis prompts)

These rules are the most important prompt engineering in the system:

```markdown
## How to abstract from code to business rules

You are a product analyst reverse-engineering an application. Your audience
has never seen the source code and does not know what language or framework
it uses. Write for them.

### DO:
- "Users authenticate via email and password"
- "Access tokens expire after a configurable short period"
- "Each user has exactly one assigned role"
- "The system prevents duplicate email registrations"

### DO NOT:
- "The `authenticateUser()` function in `src/auth/service.ts` calls bcrypt"
- "Express middleware checks `req.headers.authorization`"
- "The Knex migration creates a `users` table with a unique index on email"
- "The JWT payload includes `{ userId, role, iat, exp }`"

### The reimplementation test
After writing each requirement, ask: "Could a team implement this in a
completely different tech stack using only this sentence?" If the answer
is no, you included an implementation detail. Remove it.

### Gap detection
Flag anything a production system would need but this code lacks. Frame
gaps as product decisions to revisit, not bugs. Use a "Known Gaps" section.

### Ambiguity detection
When code behavior seems accidental rather than intentional (e.g., a
race condition that happens to not cause problems, or a hardcoded value
that should be configurable), note it as an ambiguity.
```

---

## Success Criteria

1. **Abstraction quality:** No spec contains file paths, function names, class
   names, variable names, or framework-specific APIs.
2. **Reimplementation test:** A team could build a functionally equivalent system
   in any tech stack using only the specs.
3. **Completeness:** Every source domain maps to at least one spec file.
4. **Scaling:** Pipeline completes on a 20k-file codebase within cost and time
   budgets, with all intermediate artifacts within token ceilings.
5. **Resumability:** A crashed run can be resumed from the last completed task.
6. **Ridgeline compatibility:** Output can be used directly as
   `ridgeline spec` input.
7. **Honest gaps:** Known gaps are flagged, not papered over.
8. **Bounded artifacts:** No intermediate or output file exceeds 5k tokens when
   it needs to be loaded into a Claude context.
9. **Cross-domain consistency:** No two specs contain contradictory rules for
   the same behavior (verified by reconciliation).
10. **Mechanical abstraction check:** No spec file contains file extensions,
    framework names from the manifest, or path-like strings outside of
    intentional architecture references.
