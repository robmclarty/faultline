import { spawn, ChildProcess } from 'node:child_process'

import { append_budget_entry, create_budget_entry, read_budget } from '../../stores/budget.js'
import type { ClaudeInvocationResult } from '../../types.js'
import { extract_result } from './stream_parser.js'

///////////////////////////////////////////////////////////////// Constants //

const DEFAULT_TIMEOUT = 300_000
const MAX_RETRIES = 3
const BASE_DELAY = 1_000

/** Kill if no stdout arrives within 2 minutes of spawn. */
const DEFAULT_STARTUP_TIMEOUT_MS = 2 * 60 * 1000

/** Kill if no stdout arrives for 5 minutes during execution. */
const DEFAULT_STALL_TIMEOUT_MS = 5 * 60 * 1000

/////////////////////////////////////////////////////////////////////// Types //

export type InvokeOptions = {
  model: string
  system_prompt: string
  input: string
  timeout?: number
  max_retries?: number
  max_budget_usd?: number
  output_dir: string
  phase: string
  task: string
  verbose?: boolean
  allowed_tools?: string[]
  agents?: string[]
  json_schema?: string
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

export class BudgetExceededError extends Error {
  constructor(
    public spent: number,
    public limit: number
  ) {
    super(
      `Budget ceiling exceeded: $${spent.toFixed(4)} spent ` +
      `of $${limit.toFixed(2)} limit`
    )
    this.name = 'BudgetExceededError'
  }
}

///////////////////////////////////////////////////////////////////// Helpers //

/**
 * Registry of active child processes. Used for graceful SIGINT cleanup when
 * running concurrent extractions.
 */
const active_processes = new Set<ChildProcess>()

/**
 * Kill a process by its process group (negative PID).
 */
const kill_proc = (proc: ChildProcess, signal: NodeJS.Signals): void => {
  if (proc.pid) {
    try { process.kill(-proc.pid, signal) } catch { /* already dead */ }
  }
}

/**
 * Graceful kill: SIGTERM all process groups, then SIGKILL after 2s.
 */
export const kill_all_claude = (): void => {
  for (const proc of active_processes) {
    kill_proc(proc, 'SIGTERM')
  }

  setTimeout(() => {
    for (const proc of active_processes) {
      kill_proc(proc, 'SIGKILL')
    }
  }, 2000)
}

/**
 * Immediate kill: SIGKILL all process groups. Use before process.exit().
 */
export const kill_all_claude_sync = (): void => {
  for (const proc of active_processes) {
    kill_proc(proc, 'SIGKILL')
  }
}

/**
 * Cleanup handler — kills all active processes on SIGINT.
 */
const setup_cleanup = (): void => {
  if (cleanup_registered) return
  cleanup_registered = true

  process.on('SIGINT', () => {
    kill_all_claude_sync()
    active_processes.clear()
  })
}

let cleanup_registered = false

/**
 * Global budget limit. When set to a positive number, invoke_claude will check
 * cumulative cost from budget.json before each invocation and throw
 * BudgetExceededError if the limit would be exceeded.
 */
let global_budget_limit = 0

/**
 * Set Budget Limit
 *
 * Sets the global budget ceiling for all subsequent Claude invocations.
 * Set to 0 to disable budget checking.
 *
 * @param limit_usd - The budget ceiling in USD.
 */
export const set_budget_limit = (limit_usd: number): void => {
  global_budget_limit = limit_usd
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
 * Spawns `claude -p` with the given system prompt and input. Handles
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
    max_budget_usd = 0,
    output_dir,
    phase,
    task,
    verbose = false,
    allowed_tools,
    agents,
    json_schema
  } = options

  // Check budget ceiling before invocation
  const effective_budget = max_budget_usd > 0 ? max_budget_usd : global_budget_limit

  if (effective_budget > 0) {
    const budget = await read_budget(output_dir)

    if (budget.total_cost >= effective_budget) {
      throw new BudgetExceededError(budget.total_cost, effective_budget)
    }
  }

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
        agents,
        json_schema
      })

      // Log cost
      const entry = create_budget_entry(
        phase,
        task,
        model,
        result.input_tokens,
        result.output_tokens,
        result.cost_usd
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
 * Low-level subprocess spawn. Passes system prompt directly via
 * --system-prompt flag, pipes input via stdin, captures stdout/stderr.
 * Uses detached process groups for reliable cleanup and includes
 * stall/startup timeout detection.
 */
const spawn_claude = async (options: {
  model: string
  system_prompt: string
  input: string
  timeout: number
  verbose: boolean
  allowed_tools?: string[]
  agents?: string[]
  json_schema?: string
}): Promise<ClaudeInvocationResult> => {
  const { model, system_prompt, input, timeout, verbose, allowed_tools, agents, json_schema } = options

  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--model', model,
    '--system-prompt', system_prompt,
    '--verbose'
  ]

  if (allowed_tools && allowed_tools.length > 0) {
    args.push('--allowedTools', ...allowed_tools)
  }

  if (agents && agents.length > 0) {
    args.push('--agents', ...agents)
  }

  if (json_schema) {
    args.push('--json-schema', json_schema)
  }

  return new Promise<ClaudeInvocationResult>((resolve, reject) => {
    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    })

    active_processes.add(proc)

    let stdout = ''
    let stderr = ''

    // --- Stall / startup detection ---
    let stalled = false
    let stall_reason = ''

    const kill_on_stall = (reason: string) => {
      stalled = true
      stall_reason = reason
      kill_proc(proc, 'SIGTERM')
      setTimeout(() => kill_proc(proc, 'SIGKILL'), 5000)
    }

    // Startup probe: short fuse for the very first stdout event
    let stall_timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      kill_on_stall(
        `No output received within ${Math.round(DEFAULT_STARTUP_TIMEOUT_MS / 1000)}s of spawn (startup timeout)`
      )
    }, DEFAULT_STARTUP_TIMEOUT_MS)

    const reset_stall_timer = () => {
      if (stalled) return
      if (stall_timer) clearTimeout(stall_timer)
      stall_timer = setTimeout(() => {
        kill_on_stall(
          `No output received for ${Math.round(DEFAULT_STALL_TIMEOUT_MS / 1000)}s (stall timeout)`
        )
      }, DEFAULT_STALL_TIMEOUT_MS)
    }

    proc.stdout!.on('data', (data: Buffer) => {
      stdout += data.toString()
      reset_stall_timer()
    })

    proc.stderr!.on('data', (data: Buffer) => {
      stderr += data.toString()

      if (verbose) {
        process.stderr.write(data)
      }
    })

    // --- Global timeout ---
    let timed_out = false
    const timer = setTimeout(() => {
      timed_out = true
      kill_proc(proc, 'SIGTERM')
      setTimeout(() => kill_proc(proc, 'SIGKILL'), 5000)
    }, timeout)

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (stall_timer) clearTimeout(stall_timer)
      active_processes.delete(proc)

      if (timed_out) {
        reject(new ClaudeInvocationError(
          `Claude invocation timed out after ${timeout}ms`,
          -1,
          stderr
        ))
        return
      }

      if (stalled) {
        reject(new ClaudeInvocationError(
          `Claude invocation stalled: ${stall_reason}`,
          -1,
          stderr
        ))
        return
      }

      if (code !== 0 && !stdout.trim()) {
        const lower = stderr.toLowerCase()

        if (
          lower.includes('authentication') ||
          lower.includes('unauthorized') ||
          lower.includes('forbidden') ||
          lower.includes('oauth token has expired') ||
          lower.includes('invalid_api_key')
        ) {
          reject(new ClaudeInvocationError(
            'Authentication failed. Refresh your OAuth token or API key and retry.',
            code ?? 1,
            stderr
          ))
          return
        }

        reject(new ClaudeInvocationError(
          `Claude exited with code ${code}`,
          code ?? 1,
          stderr
        ))
        return
      }

      try {
        const stream_result = extract_result(stdout)

        resolve({
          success: stream_result.success,
          result: stream_result.result,
          model,
          input_tokens: stream_result.usage.input_tokens,
          output_tokens: stream_result.usage.output_tokens,
          cache_read_input_tokens: stream_result.usage.cache_read_input_tokens,
          cache_creation_input_tokens: stream_result.usage.cache_creation_input_tokens,
          cost_usd: stream_result.cost_usd,
          duration_ms: stream_result.duration_ms,
          session_id: stream_result.session_id,
          stdout,
          stderr,
          exit_code: 0,
        })
      } catch (err) {
        reject(new ClaudeInvocationError(
          `Failed to parse stream-json output: ${err instanceof Error ? err.message : String(err)}`,
          0,
          stderr
        ))
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      if (stall_timer) clearTimeout(stall_timer)
      active_processes.delete(proc)
      reject(new ClaudeInvocationError(
        `Failed to spawn claude: ${err.message}`,
        -1,
        ''
      ))
    })

    // Pipe input via stdin
    proc.stdin!.write(input)
    proc.stdin!.end()
  })
}
