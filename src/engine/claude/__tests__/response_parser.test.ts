import { describe, it, expect } from 'vitest'

import {
  extract_json_block,
  extract_markdown_section,
  extract_markdown_body
} from '../response_parser.js'

describe('extract_json_block', () => {
  it('extracts JSON from fenced code blocks', () => {
    const output = 'Some text\n```json\n{"key": "value"}\n```\nMore text'
    const result = extract_json_block(output)

    expect(result).toEqual({ key: 'value' })
  })

  it('extracts JSON arrays from fenced blocks', () => {
    const output = '```json\n[1, 2, 3]\n```'
    const result = extract_json_block(output)

    expect(result).toEqual([1, 2, 3])
  })

  it('extracts JSON from unfenced code blocks', () => {
    const output = 'Some text\n```\n{"key": "value"}\n```'
    const result = extract_json_block(output)

    expect(result).toEqual({ key: 'value' })
  })

  it('parses raw JSON output', () => {
    const output = '{"key": "value"}'
    const result = extract_json_block(output)

    expect(result).toEqual({ key: 'value' })
  })

  it('parses raw JSON array output', () => {
    const output = '[1, 2, 3]'
    const result = extract_json_block(output)

    expect(result).toEqual([1, 2, 3])
  })

  it('throws on non-JSON output', () => {
    expect(() => extract_json_block('Just some text')).toThrow()
  })
})

describe('extract_markdown_section', () => {
  it('extracts a named section', () => {
    const md = '# Overview\n\nHello world\n\n# Details\n\nMore stuff'
    const result = extract_markdown_section(md, 'Overview')

    expect(result).toBe('Hello world')
  })

  it('extracts section with nested headings', () => {
    const md = '# Overview\n\n## Sub\n\nContent\n\n# Other'
    const result = extract_markdown_section(md, 'Overview')

    expect(result).toBe('## Sub\n\nContent')
  })

  it('returns null for missing section', () => {
    const md = '# Overview\n\nContent'
    const result = extract_markdown_section(md, 'Missing')

    expect(result).toBeNull()
  })

  it('is case-insensitive', () => {
    const md = '# OVERVIEW\n\nContent\n\n# Other'
    const result = extract_markdown_section(md, 'overview')

    expect(result).toBe('Content')
  })
})

describe('extract_markdown_body', () => {
  it('strips markdown code fences', () => {
    const output = '```markdown\n# Title\n\nContent\n```'
    const result = extract_markdown_body(output)

    expect(result).toBe('# Title\n\nContent')
  })

  it('strips md code fences', () => {
    const output = '```md\n# Title\n\nContent\n```'
    const result = extract_markdown_body(output)

    expect(result).toBe('# Title\n\nContent')
  })

  it('passes through unfenced content', () => {
    const output = '# Title\n\nContent'
    const result = extract_markdown_body(output)

    expect(result).toBe('# Title\n\nContent')
  })
})
