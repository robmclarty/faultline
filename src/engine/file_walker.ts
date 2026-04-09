import { readdir, stat } from 'node:fs/promises'
import { join, relative, extname, basename } from 'node:path'

import { estimate_tokens } from './token_estimator.js'
import { DEFAULT_EXCLUDES } from '../types.js'
import type { FileEntry, FileCategory } from '../types.js'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Walk Files
 *
 * Recursively walks a directory tree, returning a FileEntry for every
 * non-excluded file. Respects default excludes plus user-provided
 * include/exclude globs.
 *
 * @param root_dir - The root directory to walk.
 * @param include - Glob patterns to include (empty = include all).
 * @param exclude - Additional glob patterns to exclude.
 * @returns Array of file entries.
 */
export const walk_files = async (
  root_dir: string,
  include: string[] = [],
  exclude: string[] = []
): Promise<FileEntry[]> => {
  const all_excludes = [...DEFAULT_EXCLUDES, ...exclude]
  const entries: FileEntry[] = []

  await walk_recursive(root_dir, root_dir, include, all_excludes, entries)

  return entries.sort((a, b) => {
    if (a.path < b.path) return -1
    if (a.path > b.path) return 1
    return 0
  })
}

/**
 * Generate Tree
 *
 * Generates a text-based directory tree listing from file entries.
 *
 * @param entries - The file entries to render as a tree.
 * @returns Tree text.
 */
export const generate_tree = (entries: FileEntry[]): string => {
  const lines: string[] = []
  const dirs = new Set<string>()

  for (const entry of entries) {
    const parts = entry.path.split('/')

    // Collect all parent directories
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join('/'))
    }
  }

  const all_paths = [
    ...Array.from(dirs).map(d => ({ path: d, is_dir: true })),
    ...entries.map(e => ({ path: e.path, is_dir: false }))
  ].sort((a, b) => a.path.localeCompare(b.path))

  for (const item of all_paths) {
    const depth = item.path.split('/').length - 1
    const name = item.path.split('/').pop() ?? ''
    const indent = '  '.repeat(depth)
    const suffix = item.is_dir ? '/' : ''

    lines.push(`${indent}${name}${suffix}`)
  }

  return lines.join('\n') + '\n'
}

///////////////////////////////////////////////////////////////////// Helpers //

const walk_recursive = async (
  root_dir: string,
  current_dir: string,
  include: string[],
  exclude: string[],
  entries: FileEntry[]
): Promise<void> => {
  const items = await readdir(current_dir, { withFileTypes: true })

  for (const item of items) {
    const full_path = join(current_dir, item.name)
    const rel_path = relative(root_dir, full_path)

    if (should_exclude(rel_path, item.isDirectory(), exclude)) {
      continue
    }

    if (item.isDirectory()) {
      await walk_recursive(root_dir, full_path, include, exclude, entries)
      continue
    }

    if (include.length > 0 && !matches_any(rel_path, include)) {
      continue
    }

    const file_stat = await stat(full_path)
    const ext = extname(item.name)
    const tokens = estimate_tokens(file_stat.size, ext)

    entries.push({
      path: rel_path,
      size_bytes: file_stat.size,
      tokens_est: tokens,
      extension: ext,
      language: detect_language(ext),
      category: detect_category(rel_path, ext)
    })
  }
}

/**
 * Checks if a path should be excluded. Handles both simple glob patterns
 * and exact matches.
 */
export const should_exclude = (
  rel_path: string,
  is_dir: boolean,
  excludes: readonly string[]
): boolean => {
  for (const pattern of excludes) {
    if (matches_glob(rel_path, pattern, is_dir)) {
      return true
    }
  }

  return false
}

/**
 * Checks if a path matches any of the given glob patterns.
 */
export const matches_any = (rel_path: string, patterns: string[]): boolean => {
  for (const pattern of patterns) {
    if (matches_glob(rel_path, pattern, false)) {
      return true
    }
  }

  return false
}

/**
 * Simple glob matcher that handles common patterns:
 * - `*.ext` matches files with that extension
 * - `dir/**` matches everything under that directory
 * - `dir/*` matches direct children of that directory
 * - exact filename matches
 */
export const matches_glob = (
  rel_path: string,
  pattern: string,
  is_dir: boolean
): boolean => {
  // Pattern like "dir/**" — matches anything under dir/
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3)

    // Match the directory itself or anything inside it
    if (is_dir && (rel_path === prefix || rel_path.startsWith(prefix + '/'))) {
      return true
    }

    if (rel_path.startsWith(prefix + '/')) {
      return true
    }

    return false
  }

  // Pattern like "*.ext" — matches extension
  if (pattern.startsWith('*.')) {
    const ext = pattern.slice(1) // ".ext"
    const file_name = basename(rel_path)

    return file_name.endsWith(ext)
  }

  // Exact match
  if (rel_path === pattern || basename(rel_path) === pattern) {
    return true
  }

  return false
}

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.r': 'r',
  '.scala': 'scala',
  '.clj': 'clojure',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.lua': 'lua',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.fish': 'shell',
  '.ps1': 'powershell',
  '.sql': 'sql',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'text',
  '.rst': 'restructuredtext',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.dart': 'dart',
  '.zig': 'zig'
}

const detect_language = (extension: string): string => {
  return LANGUAGE_MAP[extension.toLowerCase()] ?? 'unknown'
}

const TEST_PATTERNS = ['__tests__', '.test.', '.spec.', '/test/', '/tests/']

const DOC_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.rst'])

const CONFIG_EXTENSIONS = new Set(['.json', '.yaml', '.yml', '.toml', '.ini', '.env'])

const STYLE_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less'])

const BUILD_PATTERNS = ['makefile', 'dockerfile', 'docker-compose']

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.rs', '.go', '.java', '.kt',
  '.swift', '.c', '.cpp', '.h', '.hpp', '.cs',
  '.php', '.scala', '.clj', '.ex', '.exs',
  '.erl', '.hs', '.lua', '.dart', '.zig',
  '.vue', '.svelte', '.sql', '.sh', '.bash',
  '.html', '.htm', '.xml'
])

/**
 * Maps a file to a category using extension and path-based heuristics.
 * Checks are ordered from most to least specific.
 */
const detect_category = (rel_path: string, extension: string): FileCategory => {
  const lower_path = rel_path.toLowerCase()
  const lower_ext = extension.toLowerCase()

  if (has_pattern(lower_path, TEST_PATTERNS)) return 'test'
  if (DOC_EXTENSIONS.has(lower_ext) || lower_path.includes('/docs/')) return 'documentation'
  if (is_config_file(rel_path, lower_path, lower_ext)) return 'config'
  if (STYLE_EXTENSIONS.has(lower_ext)) return 'style'
  if (has_pattern(lower_path, BUILD_PATTERNS) || lower_ext === '.mk') return 'build'
  if (SOURCE_EXTENSIONS.has(lower_ext)) return 'source'

  return 'other'
}

const has_pattern = (path: string, patterns: string[]): boolean =>
  patterns.some(p => path.includes(p))

const is_config_file = (rel_path: string, lower_path: string, ext: string): boolean =>
  CONFIG_EXTENSIONS.has(ext) ||
  lower_path.includes('config') ||
  lower_path.startsWith('.') ||
  basename(rel_path).startsWith('.')
