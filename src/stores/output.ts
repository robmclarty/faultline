import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Write Output File
 *
 * Writes a final deliverable file to the output directory.
 *
 * @param output_dir - The .faultline directory path.
 * @param filename - The output filename.
 * @param content - The file content.
 */
export const write_output_file = async (
  output_dir: string,
  filename: string,
  content: string
): Promise<void> => {
  const dir = join(output_dir, 'output')

  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, filename), content, 'utf-8')
}
