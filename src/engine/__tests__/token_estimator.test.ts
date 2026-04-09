import { describe, it, expect } from 'vitest'

import { estimate_tokens } from '../token_estimator.js'

describe('estimate_tokens', () => {
  it('returns 0 for empty files', () => {
    expect(estimate_tokens(0, '.ts')).toBe(0)
  })

  it('uses ceil(bytes/4) for code files', () => {
    expect(estimate_tokens(100, '.ts')).toBe(25)
    expect(estimate_tokens(101, '.ts')).toBe(26)
    expect(estimate_tokens(1, '.js')).toBe(1)
  })

  it('uses ceil(bytes/5) for prose files', () => {
    expect(estimate_tokens(100, '.md')).toBe(20)
    expect(estimate_tokens(101, '.md')).toBe(21)
    expect(estimate_tokens(1, '.txt')).toBe(1)
  })

  it('treats .html as prose', () => {
    expect(estimate_tokens(100, '.html')).toBe(20)
  })

  it('treats unknown extensions as code', () => {
    expect(estimate_tokens(100, '.xyz')).toBe(25)
  })

  it('is case-insensitive for extensions', () => {
    expect(estimate_tokens(100, '.MD')).toBe(20)
    expect(estimate_tokens(100, '.Html')).toBe(20)
  })
})
