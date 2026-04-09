import { describe, it, expect } from 'vitest'

import { interpolate } from '../prompt_loader.js'

describe('interpolate', () => {
  it('replaces {{variable}} placeholders', () => {
    const result = interpolate('Hello {{name}}!', { name: 'World' })

    expect(result).toBe('Hello World!')
  })

  it('replaces multiple placeholders', () => {
    const result = interpolate(
      '{{greeting}} {{name}}, welcome to {{place}}',
      { greeting: 'Hello', name: 'Alice', place: 'Wonderland' }
    )

    expect(result).toBe('Hello Alice, welcome to Wonderland')
  })

  it('leaves unmatched placeholders as-is', () => {
    const result = interpolate('Hello {{name}} and {{other}}!', { name: 'World' })

    expect(result).toBe('Hello World and {{other}}!')
  })

  it('handles empty variables', () => {
    const result = interpolate('Hello {{name}}!', {})

    expect(result).toBe('Hello {{name}}!')
  })

  it('handles template with no placeholders', () => {
    const result = interpolate('No placeholders here', { name: 'Test' })

    expect(result).toBe('No placeholders here')
  })
})
