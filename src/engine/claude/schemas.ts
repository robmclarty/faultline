/**
 * JSON schemas for structured output call sites.
 *
 * Each schema is a pre-stringified JSON string passed to Claude CLI via
 * `--json-schema`. When used, Claude returns validated JSON through a
 * synthetic `StructuredOutput` tool_use block.
 */

///////////////////////////////////////////////////////////////////////// API //

/** Schema for file classification results (survey phase). */
export const CLASSIFY_FILES_SCHEMA = JSON.stringify({
  type: 'array',
  items: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      language: { type: 'string' },
      category: {
        type: 'string',
        enum: [
          'source', 'test', 'config', 'documentation',
          'data', 'style', 'asset', 'build', 'other'
        ]
      }
    },
    required: ['path', 'language', 'category']
  }
})

/** Schema for domain mapping results (survey phase). */
export const MAP_DOMAINS_SCHEMA = JSON.stringify({
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      label: { type: 'string' },
      description: { type: 'string' },
      directories: { type: 'array', items: { type: 'string' } },
      key_files: { type: 'array', items: { type: 'string' } },
      estimated_tokens: { type: 'number' },
      priority: { type: 'number' },
      depends_on: { type: 'array', items: { type: 'string' } },
      sub_domains: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            description: { type: 'string' },
            directories: { type: 'array', items: { type: 'string' } },
            key_files: { type: 'array', items: { type: 'string' } },
            estimated_tokens: { type: 'number' }
          },
          required: ['id', 'label', 'description', 'directories', 'key_files', 'estimated_tokens']
        }
      }
    },
    required: [
      'id', 'label', 'description', 'directories', 'key_files',
      'estimated_tokens', 'priority', 'depends_on', 'sub_domains'
    ]
  }
})

/** Schema for domain review results (survey phase). */
export const DOMAIN_REVIEW_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' } },
    suggestions: { type: 'array', items: { type: 'string' } }
  },
  required: ['passed', 'issues', 'suggestions']
})

/** Schema for extraction review results (extract phase). */
export const EXTRACTION_REVIEW_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' } },
    suggestions: { type: 'array', items: { type: 'string' } },
    uncovered_files: { type: 'array', items: { type: 'string' } }
  },
  required: ['passed', 'issues', 'suggestions', 'uncovered_files']
})

/** Schema for cross-reference finding results (reconcile phase). */
export const CROSS_REFERENCE_FINDINGS_SCHEMA = JSON.stringify({
  type: 'array',
  items: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['duplicate_rule', 'missing_handoff', 'shared_invariant', 'undeclared_dependency']
      },
      description: { type: 'string' },
      affected_domains: { type: 'array', items: { type: 'string' } },
      resolution_hint: { type: 'string' }
    },
    required: ['type', 'description', 'affected_domains', 'resolution_hint']
  }
})
