import { readFile, writeFile, mkdir, readdir, cp } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Write Output File
 *
 * Writes a final deliverable file to the output directory. Supports nested
 * paths (e.g., 'specs/auth/01-identity.md') by creating intermediate dirs.
 *
 * @param output_dir - The .faultline directory path.
 * @param filename - The output filename (may include subdirectories).
 * @param content - The file content.
 */
export const write_output_file = async (
  output_dir: string,
  filename: string,
  content: string
): Promise<void> => {
  const full_path = join(output_dir, 'output', filename)
  const dir = dirname(full_path)

  await mkdir(dir, { recursive: true })
  await writeFile(full_path, content, 'utf-8')
}

/**
 * Read Output File
 *
 * Reads a deliverable file from the output directory.
 *
 * @param output_dir - The .faultline directory path.
 * @param filename - The output filename.
 * @returns The file content, or null.
 */
export const read_output_file = async (
  output_dir: string,
  filename: string
): Promise<string | null> => {
  const path = join(output_dir, 'output', filename)

  if (!existsSync(path)) {
    return null
  }

  return readFile(path, 'utf-8')
}

/**
 * Copy Output To Ridgeline
 *
 * Copies the entire output directory to .ridgeline/builds/<name>/.
 *
 * @param target_dir - The project root directory.
 * @param output_dir - The .faultline directory path.
 * @param ridgeline_name - The ridgeline build name.
 */
export const copy_output_to_ridgeline = async (
  target_dir: string,
  output_dir: string,
  ridgeline_name: string
): Promise<void> => {
  const source = join(output_dir, 'output')
  const dest = join(target_dir, '.ridgeline', 'builds', ridgeline_name)

  if (!existsSync(source)) {
    return
  }

  await mkdir(dest, { recursive: true })
  await cp(source, dest, { recursive: true })
}

/**
 * List Output Specs
 *
 * Lists all spec files in the output/specs directory.
 *
 * @param output_dir - The .faultline directory path.
 * @returns Array of spec file paths relative to output/specs/.
 */
export const list_output_specs = async (
  output_dir: string
): Promise<string[]> => {
  const specs_dir = join(output_dir, 'output', 'specs')

  if (!existsSync(specs_dir)) {
    return []
  }

  return collect_files(specs_dir, specs_dir)
}

///////////////////////////////////////////////////////////////////// Helpers //

/**
 * Recursively collects file paths relative to a base directory.
 */
const collect_files = async (
  dir: string,
  base: string
): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const full = join(dir, entry.name)

    if (entry.isDirectory()) {
      const sub = await collect_files(full, base)

      files.push(...sub)
    } else {
      files.push(full.slice(base.length + 1))
    }
  }

  return files
}
