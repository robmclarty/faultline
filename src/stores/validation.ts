import { MAX_CLAUDE_FILE_TOKENS, MAX_CLAUDE_FILE_CHARS } from '../types.js'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Validate Token Ceiling
 *
 * Ensures content intended for Claude consumption doesn't exceed the 5k token
 * ceiling (~20k chars). Throws if the limit is exceeded.
 *
 * @param content - The content to validate.
 * @param filename - The filename for error reporting.
 */
export const validate_token_ceiling = (content: string, filename: string): void => {
  if (content.length > MAX_CLAUDE_FILE_CHARS) {
    throw new TokenCeilingError(
      `File "${filename}" exceeds ${MAX_CLAUDE_FILE_TOKENS}-token ceiling ` +
      `(${content.length} chars, limit ${MAX_CLAUDE_FILE_CHARS})`
    )
  }
}

/////////////////////////////////////////////////////////////////////// Types //

export class TokenCeilingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TokenCeilingError'
  }
}
