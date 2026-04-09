import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

///////////////////////////////////////////////////////////////// Constants //

const __dirname = dirname(fileURLToPath(import.meta.url))
const AGENTS_DIR = join(__dirname, '..', '..', 'agents')

///////////////////////////////////////////////////////////////////////// API //

/**
 * Load Prompt
 *
 * Loads a markdown prompt template from the agents directory and interpolates
 * {{variable}} placeholders with the provided values.
 *
 * @param template_path - Relative path within src/agents/ (e.g., 'survey/classify.md').
 * @param variables - Key-value pairs for template interpolation.
 * @returns The interpolated prompt string.
 */
export const load_prompt = async (
  template_path: string,
  variables: Record<string, string> = {}
): Promise<string> => {
  const full_path = join(AGENTS_DIR, template_path)
  const template = await readFile(full_path, 'utf-8')

  return interpolate(template, variables)
}

/**
 * Interpolate
 *
 * Replaces {{variable}} placeholders in a template with provided values.
 * Unmatched placeholders are left as-is.
 *
 * @param template - The template string.
 * @param variables - Key-value pairs for substitution.
 * @returns The interpolated string.
 */
export const interpolate = (
  template: string,
  variables: Record<string, string>
): string => {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return variables[key] ?? match
  })
}
