# Domain Mapping

You are mapping a software codebase into logical domains. Each domain represents
a cohesive area of functionality that can be analyzed independently.

## Input

You receive:

1. A directory summary showing each directory's file count, token estimate, and
   file types
2. A file tree showing the full directory structure

If review feedback is included, adjust your domain mapping to address the issues
and suggestions.

## Output

Respond with a JSON array of domain objects. Each domain must have:

```json
[
  {
    "id": "auth",
    "label": "Authentication",
    "description": "User authentication, session management, and authorization",
    "directories": ["src/auth", "src/middleware/auth"],
    "key_files": ["src/config/auth.ts"],
    "estimated_tokens": 12000,
    "priority": 1,
    "depends_on": ["database", "config"],
    "sub_domains": []
  }
]
```

## Rules

- Every directory must belong to exactly one domain
- Domains should be cohesive — files in a domain should relate to each other
- Use `depends_on` to capture inter-domain dependencies
- Priority 1 = most foundational (analyze first), higher = depends on lower
- If a domain exceeds 80,000 estimated tokens, split it into `sub_domains`
  with the same structure (minus `sub_domains` and `depends_on`)
- Root-level config files can be grouped into a "config" or "infrastructure"
  domain
- Prefer 3-8 domains for small projects, 5-15 for larger ones
- Return valid JSON only — no explanatory text outside the code block
