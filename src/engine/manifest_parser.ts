import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

import type { Manifest, ManifestDependency } from '../types.js'

///////////////////////////////////////////////////////////////// Constants //

const SUPPORTED_MANIFESTS = ['package.json', 'Cargo.toml', 'pyproject.toml'] as const

///////////////////////////////////////////////////////////////////////// API //

/**
 * Parse Manifest
 *
 * Detects and parses the dependency manifest for a project directory. Currently
 * supports package.json with extensibility for other formats.
 *
 * @param root_dir - The project root directory.
 * @returns The parsed manifest, or null if no recognized manifest found.
 */
export const parse_manifest = async (root_dir: string): Promise<Manifest | null> => {
  // Try package.json first
  const pkg_path = join(root_dir, 'package.json')

  if (existsSync(pkg_path)) {
    return parse_package_json(pkg_path)
  }

  // Check other manifest types for future support
  for (const name of SUPPORTED_MANIFESTS) {
    if (existsSync(join(root_dir, name))) {
      // For now, only package.json is fully implemented
      return null
    }
  }

  return null
}

///////////////////////////////////////////////////////////////////// Helpers //

const parse_package_json = async (path: string): Promise<Manifest> => {
  const content = await readFile(path, 'utf-8')
  const pkg = JSON.parse(content) as Record<string, unknown>

  const dependencies: ManifestDependency[] = []

  if (pkg.dependencies && typeof pkg.dependencies === 'object') {
    for (const [name, version] of Object.entries(pkg.dependencies as Record<string, string>)) {
      dependencies.push({ name, version, dev: false })
    }
  }

  if (pkg.devDependencies && typeof pkg.devDependencies === 'object') {
    for (const [name, version] of Object.entries(pkg.devDependencies as Record<string, string>)) {
      dependencies.push({ name, version, dev: true })
    }
  }

  return {
    name: typeof pkg.name === 'string' ? pkg.name : 'unknown',
    version: typeof pkg.version === 'string' ? pkg.version : '0.0.0',
    type: 'npm',
    dependencies
  }
}
