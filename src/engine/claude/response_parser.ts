///////////////////////////////////////////////////////////////////////// API //

/**
 * Extract JSON Block
 *
 * Extracts the first JSON code block from Claude's mixed text/code output.
 * Looks for ```json ... ``` blocks, then falls back to raw JSON detection.
 *
 * @param output - The raw Claude stdout output.
 * @returns The parsed JSON value.
 * @throws If no valid JSON block is found.
 */
export const extract_json_block = <T = unknown>(output: string): T => {
  // Try fenced JSON code block first
  const fenced = output.match(/```json\s*\n([\s\S]*?)\n\s*```/)

  if (fenced) {
    return JSON.parse(fenced[1]) as T
  }

  // Try any fenced code block
  const any_fenced = output.match(/```\s*\n([\s\S]*?)\n\s*```/)

  if (any_fenced) {
    try {
      return JSON.parse(any_fenced[1]) as T
    } catch {
      // Not JSON, continue
    }
  }

  // Try parsing the entire output as JSON
  const trimmed = output.trim()

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as T
    } catch {
      // Not JSON, continue
    }
  }

  throw new ResponseParseError(`No valid JSON block found in output:\n${output.slice(0, 500)}`)
}

/**
 * Extract Markdown Section
 *
 * Extracts a named section from markdown output. A section starts with a
 * heading matching the name and ends at the next heading of equal or lesser
 * depth, or end of content.
 *
 * @param output - The markdown content.
 * @param section_name - The heading text to look for.
 * @returns The section content (without the heading itself).
 */
export const extract_markdown_section = (
  output: string,
  section_name: string
): string | null => {
  const lines = output.split('\n')
  let capturing = false
  let section_depth = 0
  const result: string[] = []

  for (const line of lines) {
    const heading_match = line.match(/^(#{1,6})\s+(.+)$/)

    if (heading_match) {
      const depth = heading_match[1].length
      const title = heading_match[2].trim()

      if (capturing) {
        // Stop at same or lesser depth heading
        if (depth <= section_depth) {
          break
        }
      }

      if (title.toLowerCase() === section_name.toLowerCase()) {
        capturing = true
        section_depth = depth
        continue
      }
    }

    if (capturing) {
      result.push(line)
    }
  }

  if (result.length === 0) {
    return null
  }

  // Trim leading/trailing blank lines
  while (result.length > 0 && result[0].trim() === '') {
    result.shift()
  }

  while (result.length > 0 && result[result.length - 1].trim() === '') {
    result.pop()
  }

  return result.join('\n')
}

/**
 * Extract Markdown Body
 *
 * Returns the full markdown content, stripping any leading code fences or
 * markdown fences that Claude sometimes wraps output in.
 *
 * @param output - The raw output.
 * @returns Clean markdown content.
 */
export const extract_markdown_body = (output: string): string => {
  let content = output.trim()

  // Strip wrapping markdown code fences
  if (content.startsWith('```markdown\n') || content.startsWith('```md\n')) {
    const end = content.lastIndexOf('```')

    if (end > 0) {
      content = content.slice(content.indexOf('\n') + 1, end).trim()
    }
  }

  // Strip conversational preamble before first markdown heading (h2/h3).
  // Extraction prompts produce output starting with ### headings, so anything
  // before the first heading is LLM preamble that shouldn't be in the notes.
  const first_heading = content.search(/^#{2,3}\s/m)

  if (first_heading > 0) {
    content = content.slice(first_heading).trim()
  }

  return content
}

/////////////////////////////////////////////////////////////////////// Types //

export class ResponseParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResponseParseError'
  }
}
