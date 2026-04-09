import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'

import { parse_manifest } from '../manifest_parser.js'

const FIXTURE_DIR = resolve(import.meta.dirname, '../../../test/fixtures/sample-app')

describe('parse_manifest', () => {
  it('parses package.json from fixture directory', async () => {
    const manifest = await parse_manifest(FIXTURE_DIR)

    expect(manifest).not.toBeNull()
    expect(manifest!.name).toBe('sample-app')
    expect(manifest!.version).toBe('1.2.3')
    expect(manifest!.type).toBe('npm')
  })

  it('includes production dependencies', async () => {
    const manifest = await parse_manifest(FIXTURE_DIR)
    const express = manifest!.dependencies.find(d => d.name === 'express')

    expect(express).toBeDefined()
    expect(express!.dev).toBe(false)
  })

  it('includes dev dependencies', async () => {
    const manifest = await parse_manifest(FIXTURE_DIR)
    const jest = manifest!.dependencies.find(d => d.name === 'jest')

    expect(jest).toBeDefined()
    expect(jest!.dev).toBe(true)
  })

  it('returns null for directory with no manifest', async () => {
    const manifest = await parse_manifest('/tmp')

    expect(manifest).toBeNull()
  })
})
