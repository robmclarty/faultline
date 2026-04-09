import { spawn } from 'node:child_process'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { append_budget_entry, create_budget_entry } from '../../stores/budget.js'
import type { ClaudeInvocationResult } from '../../types.js'

///////////////////////////////////////////////////////////////// Constants //

const DEFAULT_TIMEOUT = 300_000
const MAX_RETRIES = 3
const BASE_DELAY = 1_000

/////////////////////////////////////////////////////////////////////// Types //

export type InvokeOptions = {
  model: string
  system_prompt: string
  input: string
  timeout?: number
  max_retries?: number
  output_dir: string
  phase: string
  task: string
  verbose?: boolean
  allowed_tools?: string[]
  agents?: string[]
}

export class ClaudeInvocationError extends Error {
  constructor(
    message: string,
    public exit_code: number,
    public stderr: string
  ) {
    super(message)
    this.name = 'ClaudeInvocationError'
  }
}

///////////////////////////////////////////////////////////////////// Helpers //

/**
 * Registry of active child processes. Used for graceful SIGINT cleanup when
 * running concurrent extractions.
 */
const active_processes = new Set<ReturnType<typeof spawn>>()

/**
 * Cleanup handler — kills all active processes on SIGINT.
 */
const setup_cleanup = (): void => {
  if (cleanup_registered) return
  cleanup_registered = true

  process.on('SIGINT', () => {
    for (const proc of active_processes) {
      proc.kill('SIGTERM')
    }

    active_processes.clear()
  })
}

let cleanup_registered = false

/**
 * Parses token counts from Claude's verbose stderr output.
 */
const parse_token_counts = (
  stderr: string
): { input_tokens: number, output_tokens: number } => {
  const input_match = stderr.match(/input[_\s]tokens[:\s]+(\d+)/i)
  const output_match = stderr.match(/output[_\s]tokens[:\s]+(\d+)/i)

  return {
    input_tokens: input_match ? parseInt(input_match[1], 10) : 0,
    output_tokens: output_match ? parseInt(output_match[1], 10) : 0
  }
}

/**
 * Sleeps for the given number of milliseconds.
 */
const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

///////////////////////////////////////////////////////////////////////// API //

/**
 * Invoke Claude
 *
 * Spawns `claude --print` with the given system prompt and input. Handles
 * timeout enforcement, retry with exponential backoff, and cost logging.
 *
 * @param options - Invocation configuration.
 * @returns The invocation result.
 */
export const invoke_claude = async (options: InvokeOptions): Promise<ClaudeInvocationResult> => {
  setup_cleanup()

  const {
    model,
    system_prompt,
    input,
    timeout = DEFAULT_TIMEOUT,
    max_retries = MAX_RETRIES,
    output_dir,
    phase,
    task,
    verbose = false,
    allowed_tools,
    agents
  } = options

  let last_error: Error | null = null

  for (let attempt = 0; attempt <= max_retries; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY * Math.pow(2, attempt - 1)

      await sleep(delay)
    }

    try {
      const result = await spawn_claude({
        model,
        system_prompt,
        input,
        timeout,
        verbose,
        allowed_tools,
        agents
      })

      // Log cost
      const entry = create_budget_entry(
        phase,
        task,
        model,
        result.input_tokens,
        result.output_tokens
      )

      await append_budget_entry(output_dir, entry)

      return result
    } catch (err) {
      last_error = err instanceof Error ? err : new Error(String(err))

      if (attempt < max_retries) {
        continue
      }
    }
  }

  throw last_error ?? new Error('Claude invocation failed')
}

/**
 * Spawn Claude
 *
 * Low-level subprocess spawn. Creates a temp file for the system prompt,
 * pipes input via stdin, captures stdout/stderr.
 */
const spawn_claude = async (options: {
  model: string
  system_prompt: string
  input: string
  timeout: number
  verbose: boolean
  allowed_tools?: string[]
  agents?: string[]
}): Promise<ClaudeInvocationResult> => {
  const { model, system_prompt, input, timeout, verbose, allowed_tools, agents } = options

  // Write system prompt to temp file
  const tmp_dir = await mkdtemp(join(tmpdir(), 'faultline-'))
  const prompt_path = join(tmp_dir, 'system.md')

  await writeFile(prompt_path, system_prompt, 'utf-8')

  const args = [
    '--print',
    '--model', model,
    '--system-prompt', prompt_path,
    '--verbose'
  ]

  if (allowed_tools && allowed_tools.length > 0) {
    args.push('--allowedTools', ...allowed_tools)
  }

  if (agents && agents.length > 0) {
    args.push('--agents', ...agents)
  }

  return new Promise<ClaudeInvocationResult>((resolve, reject) => {
    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    active_processes.add(proc)

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()

      if (verbose) {
        process.stderr.write(data)
      }
    })

    // Timeout enforcement
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new ClaudeInvocationError(
        `Claude invocation timed out after ${timeout}ms`,
        -1,
        stderr
      ))
    }, timeout)

    proc.on('close', async (code) => {
      clearTimeout(timer)
      active_processes.delete(proc)

      // Cleanup temp files
      try {
        await rm(tmp_dir, { recursive: true, force: true })
      } catch {
        // Best-effort cleanup
      }

      const tokens = parse_token_counts(stderr)

      if (code !== 0) {
        reject(new ClaudeInvocationError(
          `Claude exited with code ${code}`,
          code ?? 1,
          stderr
        ))
        return
      }

      resolve({
        stdout,
        stderr,
        exit_code: 0,
        model,
        input_tokens: tokens.input_tokens,
        output_tokens: tokens.output_tokens
      })
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      active_processes.delete(proc)
      reject(new ClaudeInvocationError(
        `Failed to spawn claude: ${err.message}`,
        -1,
        ''
      ))
    })

    // Pipe input via stdin
    proc.stdin.write(input)
    proc.stdin.end()
  })
}
