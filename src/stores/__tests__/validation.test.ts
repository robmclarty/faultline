import { describe, it, expect } from 'vitest'

import { validate_token_ceiling, TokenCeilingError } from '../validation.js'

describe('validate_token_ceiling', () => {
  it('passes for content under the limit', () => {
    const content = 'a'.repeat(19_000)

    expect(() => validate_token_ceiling(content, 'test.json')).not.toThrow()
  })

  it('throws TokenCeilingError for oversized content', () => {
    const content = 'a'.repeat(21_000)

    expect(() => validate_token_ceiling(content, 'test.json'))
      .toThrow(TokenCeilingError)
  })

  it('includes filename in error message', () => {
    const content = 'a'.repeat(21_000)

    expect(() => validate_token_ceiling(content, 'big_file.json'))
      .toThrow(/big_file\.json/)
  })
})
