import { describe, it, expect } from 'vitest'

import { extract_result, parse_claude_result } from '../stream_parser.js'

describe('parse_claude_result', () => {
  it('extracts fields from a result event', () => {
    const parsed = {
      type: 'result',
      result: 'Hello world',
      is_error: false,
      duration_ms: 5000,
      total_cost_usd: 0.05,
      session_id: 'sess-123',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 5
      }
    }

    const result = parse_claude_result(parsed)

    expect(result.success).toBe(true)
    expect(result.result).toBe('Hello world')
    expect(result.duration_ms).toBe(5000)
    expect(result.cost_usd).toBe(0.05)
    expect(result.session_id).toBe('sess-123')
    expect(result.usage.input_tokens).toBe(100)
    expect(result.usage.output_tokens).toBe(50)
    expect(result.usage.cache_read_input_tokens).toBe(10)
    expect(result.usage.cache_creation_input_tokens).toBe(5)
  })

  it('handles error results', () => {
    const parsed = {
      type: 'result',
      result: 'Something went wrong',
      is_error: true,
      duration_ms: 1000,
      total_cost_usd: 0.01,
      session_id: 'sess-456',
      usage: { input_tokens: 50, output_tokens: 10 }
    }

    const result = parse_claude_result(parsed)

    expect(result.success).toBe(false)
    expect(result.result).toBe('Something went wrong')
  })

  it('handles missing optional fields', () => {
    const parsed = { type: 'result' }

    const result = parse_claude_result(parsed)

    expect(result.success).toBe(true)
    expect(result.result).toBe('')
    expect(result.duration_ms).toBe(0)
    expect(result.cost_usd).toBe(0)
    expect(result.usage.input_tokens).toBe(0)
    expect(result.usage.output_tokens).toBe(0)
  })
})

describe('extract_result', () => {
  it('extracts result from standard text result event', () => {
    const ndjson = [
      '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello"}]}}',
      '{"type":"result","result":"Hello","is_error":false,"duration_ms":1000,"total_cost_usd":0.01,"session_id":"s1","usage":{"input_tokens":10,"output_tokens":5}}'
    ].join('\n')

    const result = extract_result(ndjson)

    expect(result.result).toBe('Hello')
    expect(result.success).toBe(true)
  })

  it('prefers StructuredOutput over result field', () => {
    const structured_json = JSON.stringify([{ id: 'auth', label: 'Authentication' }])

    const ndjson = [
      `{"type":"assistant","message":{"content":[{"type":"text","text":"Here are the domains:"},{"type":"tool_use","name":"StructuredOutput","input":${structured_json}}]}}`,
      '{"type":"result","result":"Here are the domains I identified.","is_error":false,"duration_ms":2000,"total_cost_usd":0.03,"session_id":"s2","usage":{"input_tokens":100,"output_tokens":50}}'
    ].join('\n')

    const result = extract_result(ndjson)

    // StructuredOutput takes priority over prose in result field
    expect(result.result).toBe(structured_json)
  })

  it('uses StructuredOutput when result field is empty', () => {
    const structured_json = JSON.stringify({ passed: true, issues: [] })

    const ndjson = [
      `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"StructuredOutput","input":${structured_json}}]}}`,
      '{"type":"result","result":"","is_error":false,"duration_ms":1000,"total_cost_usd":0.02,"session_id":"s3","usage":{"input_tokens":50,"output_tokens":20}}'
    ].join('\n')

    const result = extract_result(ndjson)

    expect(result.result).toBe(structured_json)
  })

  it('falls back to text parts when result is empty and no StructuredOutput', () => {
    const ndjson = [
      '{"type":"assistant","subtype":"text","text":"Part 1 "}',
      '{"type":"assistant","subtype":"text","text":"Part 2"}',
      '{"type":"result","result":"","is_error":false,"duration_ms":500,"total_cost_usd":0.005,"session_id":"s4","usage":{"input_tokens":10,"output_tokens":5}}'
    ].join('\n')

    const result = extract_result(ndjson)

    expect(result.result).toBe('Part 1 Part 2')
  })

  it('throws when no result event is found', () => {
    const ndjson = [
      '{"type":"assistant","subtype":"text","text":"Hello"}',
    ].join('\n')

    expect(() => extract_result(ndjson)).toThrow('No result event found')
  })

  it('handles StructuredOutput with string input', () => {
    const ndjson = [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"StructuredOutput","input":"raw string value"}]}}',
      '{"type":"result","result":"","is_error":false,"duration_ms":100,"total_cost_usd":0.001,"session_id":"s5","usage":{"input_tokens":5,"output_tokens":2}}'
    ].join('\n')

    const result = extract_result(ndjson)

    expect(result.result).toBe('raw string value')
  })

  it('skips invalid JSON lines gracefully', () => {
    const ndjson = [
      'not valid json',
      '{"type":"result","result":"OK","is_error":false,"duration_ms":100,"total_cost_usd":0.001,"session_id":"s6","usage":{"input_tokens":5,"output_tokens":2}}'
    ].join('\n')

    const result = extract_result(ndjson)

    expect(result.result).toBe('OK')
  })
})
