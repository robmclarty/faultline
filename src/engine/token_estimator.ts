///////////////////////////////////////////////////////////////// Constants //

/**
 * File extensions considered prose-heavy (use bytes/5 instead of bytes/4
 * for token estimation).
 */
const PROSE_EXTENSIONS = new Set([
  '.md', '.markdown', '.txt', '.rst', '.adoc', '.tex',
  '.html', '.htm', '.xml', '.svg'
])

///////////////////////////////////////////////////////////////////////// API //

/**
 * Estimate Tokens
 *
 * Estimates the token count for a file based on its size and extension.
 * Code files use ceil(bytes/4), prose files use ceil(bytes/5).
 *
 * @param size_bytes - File size in bytes.
 * @param extension - File extension including the dot.
 * @returns Estimated token count.
 */
export const estimate_tokens = (size_bytes: number, extension: string): number => {
  if (size_bytes === 0) {
    return 0
  }

  const divisor = PROSE_EXTENSIONS.has(extension.toLowerCase()) ? 5 : 4

  return Math.ceil(size_bytes / divisor)
}
