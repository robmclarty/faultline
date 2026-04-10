/////////////////////////////////////////////////////////////////////// Types //

export type ClaudeStreamResult = {
  success: boolean
  result: string
  duration_ms: number
  cost_usd: number
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
  }
  session_id: string
}

type ContentFallbacks = {
  text_parts: string[]
  structured_output: string | null
}

///////////////////////////////////////////////////////////////////////// API //

/**
 * Parse Claude Result
 *
 * Extracts a ClaudeStreamResult from a parsed `type: "result"` NDJSON event.
 */
export const parse_claude_result = (
  parsed: Record<string, unknown>
): ClaudeStreamResult => {
  const result = parsed.result
  const usage = parsed.usage as Record<string, number> | undefined

  return {
    success: !parsed.is_error,
    result: typeof result === 'string'
      ? result
      : (result != null ? JSON.stringify(result) : ''),
    duration_ms: (parsed.duration_ms as number) ?? 0,
    cost_usd: (parsed.total_cost_usd as number) ?? 0,
    usage: {
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
    },
    session_id: (parsed.session_id as string) ?? '',
  }
}

/**
 * Extract Result
 *
 * Scans accumulated NDJSON stdout for the final `type: "result"` event and
 * returns a parsed ClaudeStreamResult.
 *
 * When `--json-schema` is used, Claude CLI returns structured JSON via a
 * synthetic `StructuredOutput` tool_use block in assistant messages. The
 * `result` event's `result` field may contain prose text instead. This
 * function always prefers `StructuredOutput` when present.
 */
export const extract_result = (ndjson_stdout: string): ClaudeStreamResult => {
  const lines = ndjson_stdout.trim().split('\n')
  const fallbacks: ContentFallbacks = { text_parts: [], structured_output: null }

  let result_event: ClaudeStreamResult | null = null

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>

      if (parsed.type === 'result') {
        result_event = parse_claude_result(parsed)
        continue
      }

      collect_content_fallbacks(parsed, fallbacks)
    } catch {
      // Not valid JSON, skip
    }
  }

  if (!result_event) {
    throw new Error('No result event found in stream-json output')
  }

  // StructuredOutput (from --json-schema) is the authoritative structured
  // response and always takes priority — even when the result event already
  // contains prose text from the model.
  if (fallbacks.structured_output) {
    result_event.result = fallbacks.structured_output
  } else if (!result_event.result) {
    result_event.result = fallbacks.text_parts.length > 0
      ? fallbacks.text_parts.join('')
      : ''
  }

  return result_event
}

///////////////////////////////////////////////////////////////////// Helpers //

/**
 * Scans assistant message events for StructuredOutput tool_use blocks and
 * text content, accumulating them as fallbacks.
 */
const collect_content_fallbacks = (
  parsed: Record<string, unknown>,
  acc: ContentFallbacks
): void => {
  // Check for StructuredOutput tool_use in current-format assistant messages
  if (parsed.type === 'assistant' && parsed.message) {
    const message = parsed.message as Record<string, unknown>
    const content = message.content as Array<Record<string, unknown>> | undefined

    if (Array.isArray(content)) {
      for (const block of content) {
        if (
          block.type === 'tool_use' &&
          block.name === 'StructuredOutput' &&
          block.input != null
        ) {
          acc.structured_output = typeof block.input === 'string'
            ? block.input
            : JSON.stringify(block.input)
        }

        if (block.type === 'text' && typeof block.text === 'string') {
          acc.text_parts.push(block.text as string)
        }
      }
    }
  }

  // Legacy format text
  if (
    parsed.type === 'assistant' &&
    parsed.subtype === 'text' &&
    typeof parsed.text === 'string'
  ) {
    acc.text_parts.push(parsed.text as string)
  }
}
